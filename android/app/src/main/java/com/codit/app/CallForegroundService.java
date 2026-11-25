package com.codit.app;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ServiceInfo;
import android.graphics.Bitmap;
import android.net.wifi.WifiManager;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;
import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Serviço em primeiro plano para manter chamadas de voz WebRTC ativas em segundo plano
 * com notificação persistente (`Ongoing`) contendo `ic_stat_codit`, `largeIcon` circular
 * do participante/grupo, cronômetro nativo e os 3 botões:
 * 1. Mutar / Desmutar
 * 2. Encerrar
 * 3. Voltar
 */
public class CallForegroundService extends Service {
    public static final String ACTION_START_OR_UPDATE = "com.codit.app.action.CALL_START_OR_UPDATE";
    public static final String ACTION_TOGGLE_MUTE_OPTIMISTIC = "com.codit.app.action.CALL_TOGGLE_MUTE_OPTIMISTIC";
    public static final String ACTION_STOP = "com.codit.app.action.CALL_STOP";

    public static final String EXTRA_CONVERSATION_ID = "conversation_id";
    public static final String EXTRA_CONVERSATION_TITLE = "conversation_title";
    public static final String EXTRA_IS_GROUP = "is_group";
    public static final String EXTRA_IS_MUTED = "is_muted";
    public static final String EXTRA_CAMERA_ENABLED = "camera_enabled";
    public static final String EXTRA_PARTICIPANT_COUNT = "participant_count";
    public static final String EXTRA_STARTED_AT_MS = "started_at_ms";
    public static final String EXTRA_AVATAR_URL = "avatar_url";
    public static final String EXTRA_USERNAME = "username";

    public static final int NOTIFICATION_ID = 4101;
    private static final long WAKELOCK_MAX_DURATION_MS = 4L * 60L * 60L * 1000L;

    private static volatile boolean active = false;

    private final ExecutorService avatarExecutor = Executors.newSingleThreadExecutor();
    private PowerManager.WakeLock wakeLock;
    private WifiManager.WifiLock wifiLock;
    private boolean foregroundStarted = false;

    private String currentConversationId = "";
    private String currentTitle = "Chamada Codit";
    private boolean currentIsGroup = false;
    private boolean currentIsMuted = false;
    private boolean currentCameraEnabled = false;
    private int currentParticipantCount = 1;
    private long currentStartedAtMs = 0L;
    private String currentAvatarUrl = "";
    private String currentUsername = "";
    private Bitmap currentLargeIcon;

    public static boolean isActive() {
        return active;
    }

    @Override
    @Nullable
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public int onStartCommand(@Nullable Intent intent, int flags, int startId) {
        if (intent == null) {
            teardownAndStop();
            return START_NOT_STICKY;
        }

        String action = intent.getAction();
        if (ACTION_STOP.equals(action)) {
            teardownAndStop();
            return START_NOT_STICKY;
        }

        if (ACTION_TOGGLE_MUTE_OPTIMISTIC.equals(action)) {
            if (!active) {
                stopSelf();
                return START_NOT_STICKY;
            }
            currentIsMuted = !currentIsMuted;
            publishNotification(false);
            return START_NOT_STICKY;
        }

        if (!ACTION_START_OR_UPDATE.equals(action)) {
            teardownAndStop();
            return START_NOT_STICKY;
        }

        String nextConvId = safeTrim(intent.getStringExtra(EXTRA_CONVERSATION_ID));
        String nextTitle = safeTrim(intent.getStringExtra(EXTRA_CONVERSATION_TITLE));
        String nextAvatarUrl = safeTrim(intent.getStringExtra(EXTRA_AVATAR_URL));
        String nextUsername = safeTrim(intent.getStringExtra(EXTRA_USERNAME));

        boolean avatarIdentityChanged =
            !nextAvatarUrl.equals(currentAvatarUrl) ||
            !nextTitle.equals(currentTitle) ||
            !nextUsername.equals(currentUsername);

        currentConversationId = nextConvId;
        currentTitle = nextTitle.isEmpty() ? "Chamada Codit" : nextTitle;
        currentIsGroup = intent.getBooleanExtra(EXTRA_IS_GROUP, false);
        currentIsMuted = intent.getBooleanExtra(EXTRA_IS_MUTED, false);
        currentCameraEnabled = intent.getBooleanExtra(EXTRA_CAMERA_ENABLED, false);
        currentParticipantCount = Math.max(1, intent.getIntExtra(EXTRA_PARTICIPANT_COUNT, 1));
        long startedExtra = intent.getLongExtra(EXTRA_STARTED_AT_MS, 0L);
        if (startedExtra > 0L) {
            currentStartedAtMs = startedExtra;
        } else if (currentStartedAtMs <= 0L) {
            currentStartedAtMs = System.currentTimeMillis();
        }
        currentAvatarUrl = nextAvatarUrl;
        currentUsername = nextUsername;

        if (currentLargeIcon == null || avatarIdentityChanged) {
            Bitmap cached = NotificationAvatarLoader.peekCachedAvatar(
                currentAvatarUrl,
                currentTitle,
                currentUsername
            );
            currentLargeIcon = cached != null
                ? cached
                : NotificationAvatarLoader.renderInitialsFallbackCircle(
                    currentTitle,
                    currentUsername
                );
        }

        active = true;
        acquireRadioLocks();
        publishNotification(true);

        if (!currentAvatarUrl.isEmpty() && avatarIdentityChanged) {
            final String targetUrl = currentAvatarUrl;
            final String targetTitle = currentTitle;
            final String targetUsername = currentUsername;
            avatarExecutor.execute(() -> {
                Bitmap loaded = NotificationAvatarLoader.loadAvatarBitmap(
                    getApplicationContext(),
                    targetUrl,
                    targetTitle,
                    targetUsername
                );
                if (active && targetUrl.equals(currentAvatarUrl)) {
                    currentLargeIcon = loaded;
                    NotificationManager manager =
                        (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
                    if (manager != null && CoditNotificationHelper.canPostNotifications(this)) {
                        manager.notify(NOTIFICATION_ID, buildOngoingCallNotification());
                    }
                }
            });
        }

        return START_NOT_STICKY;
    }

    @Override
    public void onDestroy() {
        active = false;
        releaseRadioLocks();
        stopForegroundAndCancel();
        avatarExecutor.shutdownNow();
        super.onDestroy();
    }

    private void publishNotification(boolean ensureForeground) {
        CoditNotificationHelper.ensureChannels(this);
        Notification notification = buildOngoingCallNotification();

        if (ensureForeground || !foregroundStarted) {
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    int fgsType = resolveAllowedForegroundServiceTypes();
                    startForeground(NOTIFICATION_ID, notification, fgsType);
                } else {
                    startForeground(NOTIFICATION_ID, notification);
                }
                foregroundStarted = true;
                return;
            } catch (Throwable ignored) {
                foregroundStarted = false;
            }
        }

        if (CoditNotificationHelper.canPostNotifications(this)) {
            NotificationManager manager =
                (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (manager != null) {
                manager.notify(NOTIFICATION_ID, notification);
            }
        }
    }

    private int resolveAllowedForegroundServiceTypes() {
        int fgsType = ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            if (
                ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) ==
                PackageManager.PERMISSION_GRANTED
            ) {
                fgsType |= ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE;
            }
            if (
                currentCameraEnabled &&
                ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) ==
                PackageManager.PERMISSION_GRANTED
            ) {
                fgsType |= ServiceInfo.FOREGROUND_SERVICE_TYPE_CAMERA;
            }
        }
        return fgsType;
    }

    @NonNull
    private Notification buildOngoingCallNotification() {
        String linkHref = !currentConversationId.isEmpty()
            ? "/mensagens?c=" + currentConversationId
            : "/mensagens";

        int immutableFlags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            immutableFlags |= PendingIntent.FLAG_IMMUTABLE;
        }

        // Ação 3 e toque principal: Voltar para a chamada no app
        Intent returnIntent = new Intent(this, MainActivity.class);
        returnIntent.setAction(MainActivity.ACTION_CALL_RETURN);
        returnIntent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        returnIntent.putExtra(CoditNotificationHelper.EXTRA_LINK_HREF, linkHref);
        returnIntent.putExtra(CoditNotificationHelper.EXTRA_CONVERSATION_ID, currentConversationId);
        returnIntent.putExtra(CoditNotificationHelper.EXTRA_CALL_ACTION, "return");
        PendingIntent returnPendingIntent = PendingIntent.getActivity(
            this,
            41010,
            returnIntent,
            immutableFlags
        );

        // Ação 1: Mutar / Desmutar microfone sem sair do app atual
        Intent muteIntent = new Intent(this, NotificationActionReceiver.class);
        muteIntent.setAction(NotificationActionReceiver.ACTION_CALL_TOGGLE_MUTE);
        muteIntent.putExtra(CoditNotificationHelper.EXTRA_CONVERSATION_ID, currentConversationId);
        PendingIntent mutePendingIntent = PendingIntent.getBroadcast(
            this,
            41011,
            muteIntent,
            immutableFlags
        );

        // Ação 2: Encerrar chamada imediatamente
        Intent hangupIntent = new Intent(this, NotificationActionReceiver.class);
        hangupIntent.setAction(NotificationActionReceiver.ACTION_CALL_HANGUP);
        hangupIntent.putExtra(CoditNotificationHelper.EXTRA_CONVERSATION_ID, currentConversationId);
        PendingIntent hangupPendingIntent = PendingIntent.getBroadcast(
            this,
            41012,
            hangupIntent,
            immutableFlags
        );

        String muteLabel = currentIsMuted ? "Desmutar" : "Mutar";
        int muteIcon = currentIsMuted ? R.drawable.ic_notif_mic : R.drawable.ic_notif_mic_off;

        String statusSubtitle = String.format(
            Locale.getDefault(),
            "%s · %d na sala",
            currentIsMuted ? "Microfone mutado" : (currentIsGroup ? "Grupo em chamada" : "Chamada de voz ativa"),
            currentParticipantCount
        );

        Bitmap largeIcon = currentLargeIcon != null
            ? currentLargeIcon
            : NotificationAvatarLoader.renderInitialsFallbackCircle(currentTitle, currentUsername);

        return new NotificationCompat.Builder(this, CoditNotificationHelper.ONGOING_CALL_CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_codit)
            .setLargeIcon(largeIcon)
            .setColor(ContextCompat.getColor(this, R.color.codit_notification_accent))
            .setContentTitle(currentTitle)
            .setContentText(statusSubtitle)
            .setOngoing(true)
            .setAutoCancel(false)
            .setOnlyAlertOnce(true)
            .setUsesChronometer(true)
            .setWhen(currentStartedAtMs > 0L ? currentStartedAtMs : System.currentTimeMillis())
            .setShowWhen(true)
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setContentIntent(returnPendingIntent)
            .addAction(muteIcon, muteLabel, mutePendingIntent)
            .addAction(R.drawable.ic_notif_call_end, "Encerrar", hangupPendingIntent)
            .addAction(R.drawable.ic_notif_open_call, "Voltar", returnPendingIntent)
            .build();
    }

    private void teardownAndStop() {
        active = false;
        releaseRadioLocks();
        stopForegroundAndCancel();
        stopSelf();
    }

    private void stopForegroundAndCancel() {
        try {
            if (foregroundStarted) {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                    stopForeground(STOP_FOREGROUND_REMOVE);
                } else {
                    stopForeground(true);
                }
                foregroundStarted = false;
            }
        } catch (Throwable ignored) {}

        NotificationManager manager =
            (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager != null) {
            manager.cancel(NOTIFICATION_ID);
        }
    }

    private void acquireRadioLocks() {
        try {
            if (wakeLock == null) {
                PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
                if (pm != null) {
                    wakeLock = pm.newWakeLock(
                        PowerManager.PARTIAL_WAKE_LOCK,
                        "codit:voice_call_wakelock"
                    );
                    wakeLock.setReferenceCounted(false);
                }
            }
            if (wakeLock != null && !wakeLock.isHeld()) {
                wakeLock.acquire(WAKELOCK_MAX_DURATION_MS);
            }
        } catch (Throwable ignored) {}

        try {
            if (wifiLock == null) {
                WifiManager wm =
                    (WifiManager) getApplicationContext().getSystemService(Context.WIFI_SERVICE);
                if (wm != null) {
                    int mode = Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q
                        ? WifiManager.WIFI_MODE_FULL_LOW_LATENCY
                        : WifiManager.WIFI_MODE_FULL_HIGH_PERF;
                    wifiLock = wm.createWifiLock(mode, "codit:voice_call_wifilock");
                    wifiLock.setReferenceCounted(false);
                }
            }
            if (wifiLock != null && !wifiLock.isHeld()) {
                wifiLock.acquire();
            }
        } catch (Throwable ignored) {}
    }

    private void releaseRadioLocks() {
        try {
            if (wakeLock != null && wakeLock.isHeld()) {
                wakeLock.release();
            }
        } catch (Throwable ignored) {}

        try {
            if (wifiLock != null && wifiLock.isHeld()) {
                wifiLock.release();
            }
        } catch (Throwable ignored) {}
    }

    @NonNull
    private static String safeTrim(@Nullable String value) {
        if (value == null) {
            return "";
        }
        String trimmed = value.trim();
        return "null".equalsIgnoreCase(trimmed) ? "" : trimmed;
    }
}
