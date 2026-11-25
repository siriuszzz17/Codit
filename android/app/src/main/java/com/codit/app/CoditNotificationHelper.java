package com.codit.app;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.media.AudioAttributes;
import android.os.Build;
import android.provider.Settings;
import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;
import androidx.core.app.Person;
import androidx.core.app.RemoteInput;
import androidx.core.content.ContextCompat;
import androidx.core.graphics.drawable.IconCompat;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.json.JSONObject;

/**
 * Construtor central de notificações ricas do Codit no Android:
 * - `smallIcon` monocromático padrão `@drawable/ic_stat_codit`.
 * - `largeIcon` circular com avatar do remetente/chamador ou fallback seguro de iniciais.
 * - `MessagingStyle` + `RemoteInput` ("Responder") para notificações de mensagem.
 */
public final class CoditNotificationHelper {
    public static final String HIGH_PRIORITY_CHANNEL_ID = "codit_alerts_high_v1";
    public static final String ONGOING_CALL_CHANNEL_ID = "codit_calls_ongoing_v1";
    public static final String KEY_REMOTE_INPUT_REPLY = "codit_reply_text";

    public static final String EXTRA_LINK_HREF = "codit_link_href";
    public static final String EXTRA_CONVERSATION_ID = "codit_conversation_id";
    public static final String EXTRA_CONVERSATION_TITLE = "codit_conversation_title";
    public static final String EXTRA_CATEGORY = "codit_category";
    public static final String EXTRA_NOTIFICATION_TAG = "codit_notification_tag";
    public static final String EXTRA_NOTIFICATION_ID = "codit_notification_id";
    public static final String EXTRA_CALL_ACTION = "codit_call_action";

    private static final int TAGGED_NOTIFICATION_ID = 0;

    private static final ExecutorService NOTIFICATION_EXECUTOR =
        Executors.newFixedThreadPool(2);

    public static final class RichNotificationSpec {
        public final String title;
        public final String body;
        public final String category;
        public final String linkHref;
        public final String conversationId;
        public final String conversationTitle;
        public final boolean isGroup;
        public final String tag;
        public final String actorId;
        public final String actorName;
        public final String actorUsername;
        public final String actorAvatarUrl;

        public RichNotificationSpec(
            String title,
            String body,
            String category,
            String linkHref,
            String conversationId,
            String conversationTitle,
            boolean isGroup,
            String tag,
            String actorId,
            String actorName,
            String actorUsername,
            String actorAvatarUrl
        ) {
            this.title = title;
            this.body = body;
            this.category = category;
            this.linkHref = linkHref;
            this.conversationId = conversationId;
            this.conversationTitle = conversationTitle;
            this.isGroup = isGroup;
            this.tag = tag;
            this.actorId = actorId;
            this.actorName = actorName;
            this.actorUsername = actorUsername;
            this.actorAvatarUrl = actorAvatarUrl;
        }
    }

    private CoditNotificationHelper() {}

    public static void ensureChannels(@NonNull Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            return;
        }
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (manager == null) {
            return;
        }

        manager.deleteNotificationChannel("codit_alerts");

        NotificationChannel highChannel = new NotificationChannel(
            HIGH_PRIORITY_CHANNEL_ID,
            "Mensagens e alertas urgentes",
            NotificationManager.IMPORTANCE_HIGH
        );
        highChannel.setDescription("Mensagens diretas, chamadas de voz e atividades sociais do Codit.");
        highChannel.enableVibration(true);
        highChannel.setVibrationPattern(new long[] { 0L, 220L, 120L, 220L });
        highChannel.enableLights(true);
        highChannel.setLightColor(Color.parseColor("#8B6BFF"));
        highChannel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        AudioAttributes audioAttributes = new AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_NOTIFICATION)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build();
        highChannel.setSound(Settings.System.DEFAULT_NOTIFICATION_URI, audioAttributes);
        manager.createNotificationChannel(highChannel);

        NotificationChannel ongoingCallChannel = new NotificationChannel(
            ONGOING_CALL_CHANNEL_ID,
            "Chamada de voz em andamento",
            NotificationManager.IMPORTANCE_LOW
        );
        ongoingCallChannel.setDescription("Controles rápidos de microfone e encerramento durante chamadas ativas.");
        ongoingCallChannel.setShowBadge(false);
        ongoingCallChannel.enableVibration(false);
        ongoingCallChannel.setSound(null, null);
        ongoingCallChannel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        manager.createNotificationChannel(ongoingCallChannel);
    }

    public static boolean canPostNotifications(@NonNull Context context) {
        if (
            Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) !=
            PackageManager.PERMISSION_GRANTED
        ) {
            return false;
        }
        NotificationManager manager =
            (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) {
            return false;
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            return manager.areNotificationsEnabled();
        }
        return true;
    }

    @NonNull
    public static String sanitizeSafeHref(@Nullable String rawHref) {
        if (rawHref != null) {
            String trimmed = rawHref.trim();
            if (trimmed.startsWith("/") && !trimmed.startsWith("//")) {
                return trimmed;
            }
        }
        return "/";
    }

    public static void dispatchRichNotificationFromJson(
        @NonNull final Context context,
        @Nullable final String rawJson
    ) {
        if (rawJson == null || rawJson.trim().isEmpty()) {
            return;
        }
        try {
            JSONObject obj = new JSONObject(rawJson);
            String title = obj.optString("title", "").trim();
            if (title.isEmpty()) {
                return;
            }
            String body = obj.optString("body", "").trim();
            String category = obj.optString("category", "message").trim();
            String conversationId = obj.optString("conversationId", "").trim();
            String conversationTitle = obj.optString("conversationTitle", "").trim();
            boolean isGroup = obj.optBoolean("isGroup", false);
            String linkHref = sanitizeSafeHref(obj.optString("linkHref", "/"));
            String tag = obj.optString("tag", "").trim();
            if (tag.isEmpty()) {
                tag = !conversationId.isEmpty()
                    ? ("voice_call".equals(category) ? "call:" + conversationId : "conv:" + conversationId)
                    : "notif:" + Math.abs(title.hashCode());
            }
            String actorId = obj.optString("actorId", "").trim();
            String actorName = obj.optString("actorName", title).trim();
            String actorUsername = obj.optString("actorUsername", "").trim();
            String actorAvatarUrl = obj.optString("actorAvatarUrl", "").trim();
            if ("null".equalsIgnoreCase(actorAvatarUrl)) {
                actorAvatarUrl = "";
            }

            RichNotificationSpec spec = new RichNotificationSpec(
                title,
                body,
                category,
                linkHref,
                conversationId,
                conversationTitle,
                isGroup,
                tag,
                actorId,
                actorName,
                actorUsername,
                actorAvatarUrl
            );
            dispatchRichNotificationAsync(context.getApplicationContext(), spec);
        } catch (Throwable ignored) {}
    }

    public static void dispatchRichNotificationAsync(
        @NonNull final Context context,
        @NonNull final RichNotificationSpec spec
    ) {
        final Context appContext = context.getApplicationContext();
        NOTIFICATION_EXECUTOR.execute(() -> showRichNotificationSync(appContext, spec));
    }

    public static void showRichNotificationSync(
        @NonNull Context context,
        @NonNull RichNotificationSpec spec
    ) {
        if (!canPostNotifications(context)) {
            return;
        }
        ensureChannels(context);

        NotificationManager manager =
            (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) {
            return;
        }

        String avatarUrl = spec.actorAvatarUrl;
        if ((avatarUrl == null || avatarUrl.isEmpty()) && (!spec.actorId.isEmpty() || !spec.conversationId.isEmpty())) {
            String resolvedAvatar = NativeSessionStore.lookupPeerAvatarUrl(
                context,
                spec.conversationId,
                spec.actorId
            );
            if (resolvedAvatar != null) {
                avatarUrl = resolvedAvatar;
            }
        }

        String displayForAvatar = !spec.actorName.isEmpty() ? spec.actorName : spec.title;
        Bitmap largeIcon = NotificationAvatarLoader.loadAvatarBitmap(
            context,
            avatarUrl,
            displayForAvatar,
            spec.actorUsername
        );

        String effectiveHref = sanitizeSafeHref(spec.linkHref);
        if ("/".equals(effectiveHref) && NativeSessionStore.isValidUuid(spec.conversationId)) {
            effectiveHref = "/mensagens?c=" + spec.conversationId;
        }

        Intent openIntent = new Intent(context, MainActivity.class);
        openIntent.setAction(MainActivity.ACTION_OPEN_FROM_NOTIFICATION);
        openIntent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        openIntent.putExtra(EXTRA_LINK_HREF, effectiveHref);
        openIntent.putExtra(EXTRA_CONVERSATION_ID, spec.conversationId);
        openIntent.putExtra(EXTRA_CATEGORY, spec.category);

        int reqBase = Math.abs(spec.tag.hashCode() % 1_000_000) + 10_000;
        int immutableFlags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            immutableFlags |= PendingIntent.FLAG_IMMUTABLE;
        }
        PendingIntent contentPendingIntent = PendingIntent.getActivity(
            context,
            reqBase,
            openIntent,
            immutableFlags
        );

        String safeBody = !spec.body.isEmpty()
            ? spec.body
            : "Toque para visualizar no Codit.";

        NotificationCompat.Builder builder = new NotificationCompat.Builder(
            context,
            HIGH_PRIORITY_CHANNEL_ID
        )
            .setSmallIcon(R.drawable.ic_stat_codit)
            .setLargeIcon(largeIcon)
            .setColor(ContextCompat.getColor(context, R.color.codit_notification_accent))
            .setContentTitle(spec.title)
            .setContentText(safeBody)
            .setAutoCancel(true)
            .setOnlyAlertOnce(true)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setContentIntent(contentPendingIntent);

        boolean isMessageWithConversation =
            "message".equals(spec.category) &&
            NativeSessionStore.isValidUuid(spec.conversationId);

        if (isMessageWithConversation) {
            builder.setCategory(NotificationCompat.CATEGORY_MESSAGE);

            Person mePerson = new Person.Builder().setName("Você").build();
            Person senderPerson = new Person.Builder()
                .setName(!spec.actorName.isEmpty() ? spec.actorName : spec.title)
                .setIcon(IconCompat.createWithBitmap(largeIcon))
                .build();

            NotificationCompat.MessagingStyle messagingStyle =
                new NotificationCompat.MessagingStyle(mePerson);
            if (spec.isGroup && !spec.conversationTitle.isEmpty()) {
                messagingStyle.setGroupConversation(true);
                messagingStyle.setConversationTitle(spec.conversationTitle);
            }
            messagingStyle.addMessage(
                safeBody,
                System.currentTimeMillis(),
                senderPerson
            );
            builder.setStyle(messagingStyle);

            RemoteInput remoteInput = new RemoteInput.Builder(KEY_REMOTE_INPUT_REPLY)
                .setLabel("Responder mensagem...")
                .build();

            Intent replyIntent = new Intent(context, NotificationActionReceiver.class);
            replyIntent.setAction(NotificationActionReceiver.ACTION_DIRECT_REPLY);
            replyIntent.putExtra(EXTRA_CONVERSATION_ID, spec.conversationId);
            replyIntent.putExtra(
                EXTRA_CONVERSATION_TITLE,
                !spec.conversationTitle.isEmpty() ? spec.conversationTitle : spec.title
            );
            replyIntent.putExtra(EXTRA_NOTIFICATION_TAG, spec.tag);
            replyIntent.putExtra(EXTRA_NOTIFICATION_ID, TAGGED_NOTIFICATION_ID);

            int mutableFlags = PendingIntent.FLAG_UPDATE_CURRENT;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                mutableFlags |= PendingIntent.FLAG_MUTABLE;
            }
            PendingIntent replyPendingIntent = PendingIntent.getBroadcast(
                context,
                reqBase + 1,
                replyIntent,
                mutableFlags
            );

            NotificationCompat.Action replyAction = new NotificationCompat.Action.Builder(
                R.drawable.ic_notif_reply,
                "Responder",
                replyPendingIntent
            )
                .addRemoteInput(remoteInput)
                .setAllowGeneratedReplies(true)
                .setSemanticAction(NotificationCompat.Action.SEMANTIC_ACTION_REPLY)
                .setShowsUserInterface(false)
                .build();

            builder.addAction(replyAction);
        } else {
            if ("voice_call".equals(spec.category)) {
                builder.setCategory(NotificationCompat.CATEGORY_CALL);
            } else {
                builder.setCategory(NotificationCompat.CATEGORY_SOCIAL);
            }
            builder.setStyle(new NotificationCompat.BigTextStyle().bigText(safeBody));
        }

        manager.notify(spec.tag, TAGGED_NOTIFICATION_ID, builder.build());
    }

    /**
     * Atualiza ou encerra a notificação após `RemoteInput`, encerrando o spinner do sistema.
     */
    public static void completeDirectReplyNotification(
        @NonNull Context context,
        @NonNull String tag,
        int notificationId,
        @NonNull String conversationId,
        @NonNull String conversationTitle,
        @NonNull String replyText,
        boolean success
    ) {
        NotificationManager manager =
            (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null || !canPostNotifications(context)) {
            return;
        }

        Intent openIntent = new Intent(context, MainActivity.class);
        openIntent.setAction(MainActivity.ACTION_OPEN_FROM_NOTIFICATION);
        openIntent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        openIntent.putExtra(EXTRA_LINK_HREF, "/mensagens?c=" + conversationId);
        openIntent.putExtra(EXTRA_CONVERSATION_ID, conversationId);
        openIntent.putExtra(EXTRA_CATEGORY, "message");

        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            flags |= PendingIntent.FLAG_IMMUTABLE;
        }
        PendingIntent contentIntent = PendingIntent.getActivity(
            context,
            Math.abs(tag.hashCode() % 1_000_000) + 20_000,
            openIntent,
            flags
        );

        Bitmap avatar = NotificationAvatarLoader.loadAvatarBitmap(
            context,
            null,
            conversationTitle,
            null
        );

        String feedbackBody = success
            ? "Você: " + replyText
            : "Não foi possível enviar a resposta agora. Toque para abrir a conversa.";

        Notification updated = new NotificationCompat.Builder(context, HIGH_PRIORITY_CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_codit)
            .setLargeIcon(avatar)
            .setColor(ContextCompat.getColor(context, R.color.codit_notification_accent))
            .setContentTitle(conversationTitle.isEmpty() ? "Codit" : conversationTitle)
            .setContentText(feedbackBody)
            .setOnlyAlertOnce(true)
            .setAutoCancel(true)
            .setTimeoutAfter(success ? 3_500L : 15_000L)
            .setContentIntent(contentIntent)
            .build();

        manager.notify(tag, notificationId, updated);
    }

    public static void dismissByTag(@NonNull Context context, @Nullable String tag) {
        if (tag == null || tag.trim().isEmpty()) {
            return;
        }
        NotificationManager manager =
            (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager != null) {
            manager.cancel(tag.trim(), TAGGED_NOTIFICATION_ID);
        }
    }
}
