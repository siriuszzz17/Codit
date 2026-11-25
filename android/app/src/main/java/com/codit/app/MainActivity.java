package com.codit.app;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.res.Configuration;
import android.graphics.Color;
import android.graphics.Rect;
import android.graphics.drawable.ColorDrawable;
import android.media.projection.MediaProjectionManager;
import android.os.Build;
import android.os.Bundle;
import android.util.DisplayMetrics;
import android.view.View;
import android.view.WindowMetrics;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import androidx.activity.EdgeToEdge;
import androidx.activity.result.ActivityResult;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.core.content.ContextCompat;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import com.getcapacitor.BridgeActivity;
import java.lang.ref.WeakReference;
import java.util.Locale;
import java.util.Map;
import org.json.JSONObject;

/**
 * Atividade principal (Capacitor) em modo edge-to-edge.
 *
 * Expõe `window.CoditNative` para:
 * - Safe-area CSS e teclado IME;
 * - Projeção de tela `MediaProjection` (`ScreenCaptureService`);
 * - Sessão nativa Supabase (`NativeSessionStore`) para `RemoteInput` em background;
 * - Notificações ricas com avatar circular e chamada ativa persistente (`CallForegroundService`).
 */
public class MainActivity extends BridgeActivity {
    public static final String HIGH_PRIORITY_CHANNEL_ID =
        CoditNotificationHelper.HIGH_PRIORITY_CHANNEL_ID;
    public static final String ACTION_OPEN_FROM_NOTIFICATION =
        "com.codit.app.action.OPEN_FROM_NOTIFICATION";
    public static final String ACTION_CALL_RETURN =
        "com.codit.app.action.CALL_RETURN";

    // Mesmos valores de --background em src/app/globals.css (claro / escuro).
    private static final int LIGHT_BACKGROUND = Color.parseColor("#F8F7FC");
    private static final int DARK_BACKGROUND = Color.parseColor("#0B0A16");

    private static volatile WeakReference<MainActivity> activeInstanceRef =
        new WeakReference<>(null);
    private static volatile boolean appInForeground = false;
    private static volatile String pendingNavigationHref = null;

    private volatile int insetTop = 0;
    private volatile int insetRight = 0;
    private volatile int insetBottom = 0;
    private volatile int insetLeft = 0;

    private CoditWebChromeClient.RuntimePermissionCallback pendingWebPermissionCallback;

    private final ActivityResultLauncher<String[]> webPermissionLauncher =
        registerForActivityResult(
            new ActivityResultContracts.RequestMultiplePermissions(),
            (Map<String, Boolean> grantMap) -> {
                CoditWebChromeClient.RuntimePermissionCallback cb = pendingWebPermissionCallback;
                pendingWebPermissionCallback = null;
                if (cb != null) {
                    cb.onResult(grantMap);
                }
            }
        );

    private final ActivityResultLauncher<Intent> screenCaptureLauncher =
        registerForActivityResult(
            new ActivityResultContracts.StartActivityForResult(),
            this::handleScreenCaptureResult
        );

    private final ScreenCaptureService.Listener screenCaptureListener =
        new ScreenCaptureService.Listener() {
            @Override
            public void onStarted(int width, int height) {
                dispatchWindowEvent(
                    "codit:native-screen-started",
                    String.format(Locale.US, "{\"width\":%d,\"height\":%d}", width, height)
                );
            }

            @Override
            public void onStopped() {
                dispatchWindowEvent("codit:native-screen-stopped", "null");
            }

            @Override
            public void onError(String message) {
                String safeJson = JSONObject.quote(
                    message != null ? message : "Erro no compartilhamento de tela."
                );
                dispatchWindowEvent(
                    "codit:native-screen-error",
                    String.format(Locale.US, "{\"message\":%s}", safeJson)
                );
            }
        };

    public static boolean isAppInForeground() {
        return appInForeground;
    }

    public static void dispatchCallActionFromReceiver(
        @NonNull String action,
        @NonNull String conversationId
    ) {
        MainActivity instance = activeInstanceRef.get();
        if (instance == null) {
            return;
        }
        String payload = String.format(
            Locale.US,
            "{\"action\":%s,\"conversationId\":%s}",
            JSONObject.quote(action),
            JSONObject.quote(conversationId)
        );
        instance.dispatchWindowEvent("codit:native-call-action", payload);
    }

    public static void notifyDirectReplySyncedFromReceiver(
        @NonNull String conversationId,
        @NonNull String content
    ) {
        MainActivity instance = activeInstanceRef.get();
        if (instance == null) {
            return;
        }
        String payload = String.format(
            Locale.US,
            "{\"conversationId\":%s,\"content\":%s,\"sentViaRest\":true}",
            JSONObject.quote(conversationId),
            JSONObject.quote(content)
        );
        instance.dispatchWindowEvent("codit:native-reply-sent", payload);
    }

    public static boolean dispatchDirectReplyToWebViewFromReceiver(
        @NonNull String conversationId,
        @NonNull String content
    ) {
        MainActivity instance = activeInstanceRef.get();
        if (instance == null || instance.getBridge() == null || instance.getBridge().getWebView() == null) {
            return false;
        }
        String payload = String.format(
            Locale.US,
            "{\"conversationId\":%s,\"content\":%s}",
            JSONObject.quote(conversationId),
            JSONObject.quote(content)
        );
        instance.dispatchWindowEvent("codit:native-notification-reply", payload);
        return true;
    }

    @Override
    public void onCreate(Bundle savedInstanceState) {
        setTheme(R.style.AppTheme_NoActionBar);
        EdgeToEdge.enable(this);
        super.onCreate(savedInstanceState);
        activeInstanceRef = new WeakReference<>(this);
        CoditNotificationHelper.ensureChannels(this);
        applyBackgrounds();
        ScreenCaptureService.setListener(screenCaptureListener);
        installNativeBridge();
        captureNotificationIntent(getIntent(), false);
    }

    @Override
    public void onResume() {
        super.onResume();
        activeInstanceRef = new WeakReference<>(this);
        appInForeground = true;
    }

    @Override
    public void onPause() {
        appInForeground = false;
        super.onPause();
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        captureNotificationIntent(intent, true);
    }

    @Override
    public void onDestroy() {
        appInForeground = false;
        MainActivity current = activeInstanceRef.get();
        if (current == this) {
            activeInstanceRef = new WeakReference<>(null);
        }
        ScreenCaptureService.setListener(null);
        super.onDestroy();
    }

    @Override
    public void onConfigurationChanged(Configuration newConfig) {
        super.onConfigurationChanged(newConfig);
        EdgeToEdge.enable(this);
        applyBackgrounds();
    }

    private void captureNotificationIntent(@Nullable Intent intent, boolean dispatchImmediately) {
        if (intent == null) {
            return;
        }
        String rawHref = intent.getStringExtra(CoditNotificationHelper.EXTRA_LINK_HREF);
        if (rawHref == null || rawHref.trim().isEmpty()) {
            Bundle extras = intent.getExtras();
            if (extras != null) {
                rawHref = extras.getString("linkHref");
            }
        }
        if (rawHref == null || rawHref.trim().isEmpty()) {
            return;
        }
        String safeHref = CoditNotificationHelper.sanitizeSafeHref(rawHref);
        pendingNavigationHref = safeHref;

        String callAction = intent.getStringExtra(CoditNotificationHelper.EXTRA_CALL_ACTION);
        String convId = intent.getStringExtra(CoditNotificationHelper.EXTRA_CONVERSATION_ID);

        if (dispatchImmediately) {
            if ("return".equals(callAction)) {
                String callPayload = String.format(
                    Locale.US,
                    "{\"action\":\"return\",\"conversationId\":%s,\"linkHref\":%s}",
                    JSONObject.quote(convId != null ? convId : ""),
                    JSONObject.quote(safeHref)
                );
                dispatchWindowEvent("codit:native-call-action", callPayload);
            }
            dispatchWindowEvent(
                "codit:native-navigate",
                String.format(Locale.US, "{\"linkHref\":%s}", JSONObject.quote(safeHref))
            );
        }
    }

    private void applyBackgrounds() {
        boolean isNight =
            (getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK) ==
            Configuration.UI_MODE_NIGHT_YES;
        int color = isNight ? DARK_BACKGROUND : LIGHT_BACKGROUND;
        getWindow().setBackgroundDrawable(new ColorDrawable(color));
        getWindow().getDecorView().setBackgroundColor(color);
        if (getBridge() != null && getBridge().getWebView() != null) {
            getBridge().getWebView().setBackgroundColor(color);
        }
    }

    private void installNativeBridge() {
        if (getBridge() == null || getBridge().getWebView() == null) {
            return;
        }

        final WebView webView = getBridge().getWebView();
        webView.setWebChromeClient(
            new CoditWebChromeClient(
                this,
                getBridge(),
                (permissions, callback) -> {
                    pendingWebPermissionCallback = callback;
                    webPermissionLauncher.launch(permissions);
                }
            )
        );
        webView.addJavascriptInterface(new CoditNativeBridge(), "CoditNative");

        final View decor = getWindow().getDecorView();
        ViewCompat.setOnApplyWindowInsetsListener(
            decor,
            (view, insets) -> {
                Insets bars = insets.getInsets(
                    WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout()
                );
                Insets ime = insets.getInsets(WindowInsetsCompat.Type.ime());
                boolean imeVisible = insets.isVisible(WindowInsetsCompat.Type.ime());

                // Com o teclado aberto, a area do WebView encolhe ate o topo do teclado.
                view.setPadding(0, 0, 0, imeVisible ? ime.bottom : 0);

                float density = getResources().getDisplayMetrics().density;
                insetTop = Math.round(bars.top / density);
                insetRight = Math.round(bars.right / density);
                insetLeft = Math.round(bars.left / density);
                insetBottom = imeVisible ? 0 : Math.round(bars.bottom / density);

                pushInsetsToPage(webView);

                if (imeVisible) {
                    return new WindowInsetsCompat.Builder(insets)
                        .setInsets(
                            WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout(),
                            Insets.of(bars.left, bars.top, bars.right, 0)
                        )
                        .setInsets(WindowInsetsCompat.Type.ime(), Insets.NONE)
                        .setVisible(WindowInsetsCompat.Type.ime(), false)
                        .build();
                }

                return insets;
            }
        );
        ViewCompat.requestApplyInsets(decor);
    }

    private int[] readActivityDisplayMetrics() {
        DisplayMetrics dm = getResources().getDisplayMetrics();
        int width = dm.widthPixels;
        int height = dm.heightPixels;
        int densityDpi = dm.densityDpi;

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            try {
                WindowMetrics wm = getWindowManager().getCurrentWindowMetrics();
                Rect bounds = wm.getBounds();
                if (bounds.width() > 0 && bounds.height() > 0) {
                    width = bounds.width();
                    height = bounds.height();
                }
            } catch (Throwable ignored) {}
        }

        return new int[] {
            Math.max(width, 720),
            Math.max(height, 1280),
            Math.max(densityDpi, 160)
        };
    }

    private void handleScreenCaptureResult(ActivityResult result) {
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null) {
            dispatchWindowEvent("codit:native-screen-cancelled", "null");
            return;
        }

        int[] metrics = readActivityDisplayMetrics();
        Intent serviceIntent = new Intent(this, ScreenCaptureService.class);
        serviceIntent.setAction(ScreenCaptureService.ACTION_START);
        serviceIntent.putExtra(ScreenCaptureService.EXTRA_RESULT_CODE, result.getResultCode());
        serviceIntent.putExtra(ScreenCaptureService.EXTRA_RESULT_DATA, result.getData());
        serviceIntent.putExtra(ScreenCaptureService.EXTRA_DISPLAY_WIDTH, metrics[0]);
        serviceIntent.putExtra(ScreenCaptureService.EXTRA_DISPLAY_HEIGHT, metrics[1]);
        serviceIntent.putExtra(ScreenCaptureService.EXTRA_DISPLAY_DENSITY, metrics[2]);
        ContextCompat.startForegroundService(this, serviceIntent);
    }

    void dispatchWindowEvent(final String eventName, final String detailJsonLiteral) {
        if (getBridge() == null || getBridge().getWebView() == null) {
            return;
        }
        final WebView webView = getBridge().getWebView();
        final String script = String.format(
            Locale.US,
            "try{window.dispatchEvent(new CustomEvent(%s,{detail:%s}));}catch(e){}",
            JSONObject.quote(eventName),
            detailJsonLiteral
        );
        webView.post(() -> webView.evaluateJavascript(script, null));
    }

    private void pushInsetsToPage(final WebView webView) {
        final String script = String.format(
            Locale.US,
            "try{var s=document.documentElement.style;" +
            "s.setProperty('--safe-area-inset-top','%dpx');" +
            "s.setProperty('--safe-area-inset-right','%dpx');" +
            "s.setProperty('--safe-area-inset-bottom','%dpx');" +
            "s.setProperty('--safe-area-inset-left','%dpx');}catch(e){}",
            insetTop,
            insetRight,
            insetBottom,
            insetLeft
        );
        webView.post(() -> webView.evaluateJavascript(script, null));
    }

    /** Ponte consultada pelo front-end (`window.CoditNative`). */
    public final class CoditNativeBridge {

        @JavascriptInterface
        public String getInsets() {
            return String.format(Locale.US, "%d,%d,%d,%d", insetTop, insetRight, insetBottom, insetLeft);
        }

        @JavascriptInterface
        public boolean isScreenCaptureSupported() {
            return true;
        }

        @JavascriptInterface
        public void startScreenCapture() {
            runOnUiThread(() -> {
                MediaProjectionManager manager =
                    (MediaProjectionManager) getSystemService(Context.MEDIA_PROJECTION_SERVICE);
                if (manager == null) {
                    dispatchWindowEvent(
                        "codit:native-screen-error",
                        "{\"message\":\"Projeção de tela indisponível neste dispositivo.\"}"
                    );
                    return;
                }
                try {
                    screenCaptureLauncher.launch(manager.createScreenCaptureIntent());
                } catch (Throwable err) {
                    dispatchWindowEvent(
                        "codit:native-screen-error",
                        "{\"message\":\"Não foi possível abrir a autorização de captura de tela.\"}"
                    );
                }
            });
        }

        @JavascriptInterface
        public void stopScreenCapture() {
            runOnUiThread(() -> {
                if (!ScreenCaptureService.isRunning()) {
                    return;
                }
                Intent stopIntent = new Intent(MainActivity.this, ScreenCaptureService.class);
                stopIntent.setAction(ScreenCaptureService.ACTION_STOP);
                startService(stopIntent);
            });
        }

        @JavascriptInterface
        public long getScreenFrameSeq() {
            return ScreenCaptureService.getLatestFrameSeq();
        }

        @JavascriptInterface
        public String getScreenFrameDataUrl() {
            return ScreenCaptureService.getLatestFrameDataUrl();
        }

        @JavascriptInterface
        public String getScreenDimensions() {
            int width = ScreenCaptureService.getCaptureWidth();
            int height = ScreenCaptureService.getCaptureHeight();
            if (width <= 0 || height <= 0) {
                return "";
            }
            return String.format(Locale.US, "%dx%d", width, height);
        }

        @JavascriptInterface
        public void syncAuthSession(String sessionJson) {
            NativeSessionStore.saveFromJson(getApplicationContext(), sessionJson);
        }

        @JavascriptInterface
        public void clearAuthSession() {
            NativeSessionStore.clear(getApplicationContext());
        }

        @JavascriptInterface
        public void showRichNotification(String payloadJson) {
            CoditNotificationHelper.dispatchRichNotificationFromJson(
                getApplicationContext(),
                payloadJson
            );
        }

        @JavascriptInterface
        public void dismissNotificationTag(String tag) {
            CoditNotificationHelper.dismissByTag(getApplicationContext(), tag);
        }

        @JavascriptInterface
        public void startOrUpdateCallNotification(String callJson) {
            if (callJson == null || callJson.trim().isEmpty()) {
                return;
            }
            runOnUiThread(() -> {
                try {
                    JSONObject obj = new JSONObject(callJson);
                    String conversationId = obj.optString("conversationId", "").trim();
                    String conversationTitle = obj.optString("conversationTitle", "Chamada Codit").trim();
                    boolean isGroup = obj.optBoolean("isGroup", false);
                    boolean isMuted = obj.optBoolean("isMuted", false);
                    boolean cameraEnabled = obj.optBoolean("cameraEnabled", false);
                    int participantCount = Math.max(1, obj.optInt("participantCount", 1));
                    long startedAtMs = obj.optLong("startedAtMs", System.currentTimeMillis());
                    String avatarUrl = obj.optString("avatarUrl", "").trim();
                    String username = obj.optString("username", "").trim();

                    Intent serviceIntent = new Intent(MainActivity.this, CallForegroundService.class);
                    serviceIntent.setAction(CallForegroundService.ACTION_START_OR_UPDATE);
                    serviceIntent.putExtra(CallForegroundService.EXTRA_CONVERSATION_ID, conversationId);
                    serviceIntent.putExtra(CallForegroundService.EXTRA_CONVERSATION_TITLE, conversationTitle);
                    serviceIntent.putExtra(CallForegroundService.EXTRA_IS_GROUP, isGroup);
                    serviceIntent.putExtra(CallForegroundService.EXTRA_IS_MUTED, isMuted);
                    serviceIntent.putExtra(CallForegroundService.EXTRA_CAMERA_ENABLED, cameraEnabled);
                    serviceIntent.putExtra(CallForegroundService.EXTRA_PARTICIPANT_COUNT, participantCount);
                    serviceIntent.putExtra(CallForegroundService.EXTRA_STARTED_AT_MS, startedAtMs);
                    serviceIntent.putExtra(CallForegroundService.EXTRA_AVATAR_URL, avatarUrl);
                    serviceIntent.putExtra(CallForegroundService.EXTRA_USERNAME, username);

                    if (CallForegroundService.isActive()) {
                        startService(serviceIntent);
                    } else {
                        ContextCompat.startForegroundService(MainActivity.this, serviceIntent);
                    }
                } catch (Throwable ignored) {}
            });
        }

        @JavascriptInterface
        public void stopCallNotification() {
            runOnUiThread(() -> {
                Intent stopIntent = new Intent(MainActivity.this, CallForegroundService.class);
                stopIntent.setAction(CallForegroundService.ACTION_STOP);
                startService(stopIntent);
            });
        }

        @JavascriptInterface
        public String consumePendingNavigationHref() {
            String href = pendingNavigationHref;
            pendingNavigationHref = null;
            return href != null ? href : "";
        }
    }
}
