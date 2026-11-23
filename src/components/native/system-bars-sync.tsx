"use client";

import { useEffect } from "react";

/**
 * Synchronizes Android/iOS Capacitor SystemBars visibility and icon contrast
 * with the user's current light/dark system theme.
 */
export function SystemBarsSync() {
  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    let cancelled = false;
    let mediaQuery: MediaQueryList | null = null;
    let handleThemeChange: ((event: MediaQueryListEvent) => void) | null = null;

    async function setupSystemBars() {
      try {
        const { Capacitor, SystemBars, SystemBarsStyle } = await import(
          "@capacitor/core"
        );
        if (cancelled || !Capacitor.isNativePlatform()) {
          return;
        }

        const applyTheme = async (isDark: boolean) => {
          try {
            await SystemBars.setStyle({
              style: isDark ? SystemBarsStyle.Dark : SystemBarsStyle.Light,
            });
          } catch {
            // Ignora em runtimes sem suporte ao plugin SystemBars.
          }
        };

        try {
          await SystemBars.show();
        } catch {
          // Mantem inicializacao segura mesmo se o overlay nao permitir alteracao.
        }

        mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
        await applyTheme(mediaQuery.matches);

        handleThemeChange = (event: MediaQueryListEvent) => {
          void applyTheme(event.matches);
        };
        mediaQuery.addEventListener("change", handleThemeChange);
      } catch {
        // Nao bloqueia Web/PWA ou Tauri Desktop caso Capacitor nao esteja ativo.
      }
    }

    void setupSystemBars();

    return () => {
      cancelled = true;
      if (mediaQuery && handleThemeChange) {
        mediaQuery.removeEventListener("change", handleThemeChange);
      }
    };
  }, []);

  return null;
}
