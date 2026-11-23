package com.codit.app;

import android.content.res.Configuration;
import android.graphics.Color;
import android.graphics.drawable.ColorDrawable;
import android.os.Bundle;
import androidx.activity.EdgeToEdge;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    // Mesmos valores de --background em src/app/globals.css (claro / escuro).
    private static final int LIGHT_BACKGROUND = Color.parseColor("#F8F7FC");
    private static final int DARK_BACKGROUND = Color.parseColor("#0B0A16");

    @Override
    public void onCreate(Bundle savedInstanceState) {
        EdgeToEdge.enable(this);
        super.onCreate(savedInstanceState);
        applyWindowBackground();
    }

    @Override
    public void onConfigurationChanged(Configuration newConfig) {
        super.onConfigurationChanged(newConfig);
        applyWindowBackground();
    }

    /**
     * Em WebViews antigas o Capacitor reserva a area das barras do sistema com
     * padding na janela nativa. Essa area aparece com a cor de fundo da janela,
     * entao ela precisa acompanhar o tema do app (sem faixa branca no topo).
     */
    private void applyWindowBackground() {
        boolean isNight =
            (getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK) ==
            Configuration.UI_MODE_NIGHT_YES;
        int color = isNight ? DARK_BACKGROUND : LIGHT_BACKGROUND;
        getWindow().setBackgroundDrawable(new ColorDrawable(color));
        getWindow().getDecorView().setBackgroundColor(color);
    }
}
