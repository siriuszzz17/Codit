package com.codit.app;

import android.app.Activity;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import android.content.res.Configuration;
import android.graphics.Color;
import android.graphics.drawable.ColorDrawable;
import android.media.AudioAttributes;
import android.media.projection.MediaProjectionManager;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.view.View;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import androidx.activity.EdgeToEdge;
import androidx.activity.result.ActivityResult;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.core.content.ContextCompat;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import com.getcapacitor.BridgeActivity;
import java.util.Locale;
import org.json.JSONObject;

/**
 * Atividade principal (Capacitor) em modo edge-to-edge.
 *
 * Aplica AppTheme_NoActionBar antes de EdgeToEdge.enable() e super.onCreate()
 * para evitar que a ActionBar do tema de splash seja inflada como faixa branca.
 * Também expõe a ponte nativa `window.CoditNative` para safe-area CSS e
 * projeção nativa de tela no Android (RN-505).
 */
public class MainActivity extends BridgeActivity {
    public static final String HIGH_PRIORITY_CHANNEL_ID = "codit_alerts_high_v1";

    // Mesmos valores de --background em src/app/globals.css (claro / escuro).
    private static final int LIGHT_BACKGROUND = Color.parseColor("#F8F7FC");
    private static final int DARK_BACKGROUND = Color.parseColor("#0B0A16");

    private volatile int insetTop = 0;
    private volatile int insetRight = 0;
    private volatile int insetBottom = 0;
    private volatile int insetLeft = 0;

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
                String safeJson = JSONObject.quote(message != null ? message : "Erro no compartilhamento de tela.");
                dispatchWindowEvent(
                    "codit:native-screen-error",
                    String.format(Locale.US, "{\"message\":%s}", safeJson)
                );
            }
        };

    @Override
    public void onCreate(Bundle savedInstanceState) {
        setTheme(R.style.AppTheme_NoActionBar);
        EdgeToEdge.enable(this);
        super.onCreate(savedInstanceState);
        ensureNotificationChannels();
        applyBackgrounds();
        ScreenCaptureService.setListener(screenCaptureListener);
        installNativeBridge();
    }

    private void ensureNotificationChannels() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            return;
        }
        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager == null) {
            return;
        }
        manager.deleteNotificationChannel("codit_alerts");
        NotificationChannel channel = new NotificationChannel(
            HIGH_PRIORITY_CHANNEL_ID,
            "Mensagens e alertas urgentes",
            NotificationManager.IMPORTANCE_HIGH
        );
        channel.setDescription("Mensagens diretas, chamadas de voz e atividades sociais do Codit.");
        channel.enableVibration(true);
        channel.setVibrationPattern(new long[] { 0L, 220L, 120L, 220L });
        channel.enableLights(true);
        channel.setLightColor(Color.parseColor("#8B6BFF"));
        channel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        AudioAttributes audioAttributes = new AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_NOTIFICATION)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build();
        channel.setSound(Settings.System.DEFAULT_NOTIFICATION_URI, audioAttributes);
        manager.createNotificationChannel(channel);
    }

    @Override
    public void onDestroy() {
        ScreenCaptureService.setListener(null);
        super.onDestroy();
    }

    @Override
    public void onConfigurationChanged(Configuration newConfig) {
        super.onConfigurationChanged(newConfig);
        EdgeToEdge.enable(this);
        applyBackgrounds();
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

    private void handleScreenCaptureResult(ActivityResult result) {
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null) {
            dispatchWindowEvent("codit:native-screen-cancelled", "null");
            return;
        }

        Intent serviceIntent = new Intent(this, ScreenCaptureService.class);
        serviceIntent.setAction(ScreenCaptureService.ACTION_START);
        serviceIntent.putExtra(ScreenCaptureService.EXTRA_RESULT_CODE, result.getResultCode());
        serviceIntent.putExtra(ScreenCaptureService.EXTRA_RESULT_DATA, result.getData());
        ContextCompat.startForegroundService(this, serviceIntent);
    }

    private void dispatchWindowEvent(final String eventName, final String detailJsonLiteral) {
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
    private final class CoditNativeBridge {

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
                screenCaptureLauncher.launch(manager.createScreenCaptureIntent());
            });
        }

        @JavascriptInterface
        public void stopScreenCapture() {
            runOnUiThread(() -> {
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
    }
}
