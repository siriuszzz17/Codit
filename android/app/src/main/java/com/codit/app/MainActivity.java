package com.codit.app;

import android.content.res.Configuration;
import android.graphics.Color;
import android.graphics.drawable.ColorDrawable;
import android.os.Bundle;
import android.view.View;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import androidx.activity.EdgeToEdge;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import com.getcapacitor.BridgeActivity;
import java.util.Locale;

/**
 * Atividade principal (Capacitor) em modo edge-to-edge.
 *
 * Aplica AppTheme_NoActionBar antes de EdgeToEdge.enable() e super.onCreate()
 * para evitar que a ActionBar do tema de splash seja inflada como faixa branca.
 * As areas seguras (barra de status, notch, barra de gestos) sao entregues ao
 * CSS pelas variaveis --safe-area-inset-* (ver NativeInsetsSync no front-end).
 */
public class MainActivity extends BridgeActivity {
    // Mesmos valores de --background em src/app/globals.css (claro / escuro).
    private static final int LIGHT_BACKGROUND = Color.parseColor("#F8F7FC");
    private static final int DARK_BACKGROUND = Color.parseColor("#0B0A16");

    private volatile int insetTop = 0;
    private volatile int insetRight = 0;
    private volatile int insetBottom = 0;
    private volatile int insetLeft = 0;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        setTheme(R.style.AppTheme_NoActionBar);
        EdgeToEdge.enable(this);
        super.onCreate(savedInstanceState);
        applyBackgrounds();
        installInsetsBridge();
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

    private void installInsetsBridge() {
        if (getBridge() == null || getBridge().getWebView() == null) {
            return;
        }

        final WebView webView = getBridge().getWebView();
        webView.addJavascriptInterface(new NativeInsets(), "CoditNative");

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

    /** Ponte consultada pelo front-end (window.CoditNative.getInsets()). */
    private final class NativeInsets {

        @JavascriptInterface
        public String getInsets() {
            return String.format(Locale.US, "%d,%d,%d,%d", insetTop, insetRight, insetBottom, insetLeft);
        }
    }
}
