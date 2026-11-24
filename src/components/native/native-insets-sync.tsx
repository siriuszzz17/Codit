"use client";

import { useEffect } from "react";

interface CoditNativeBridge {
  getInsets(): string;
}

declare global {
  interface Window {
    /** Injetado por `MainActivity` (Android/Capacitor). Ausente na Web, PWA e Tauri. */
    CoditNative?: CoditNativeBridge;
  }
}

const INSET_PROPERTIES = [
  "--safe-area-inset-top",
  "--safe-area-inset-right",
  "--safe-area-inset-bottom",
  "--safe-area-inset-left",
] as const;

const REAPPLY_DELAYS_MS = [150, 600, 1500] as const;

/**
 * Lê as áreas seguras (barra de status, notch, barra de gestos) expostas pela
 * `MainActivity` e as publica nas variáveis CSS `--safe-area-inset-*`.
 * No-op fora do app Android.
 */
function applyNativeInsets(): void {
  const bridge = window.CoditNative;
  if (!bridge) {
    return;
  }

  try {
    const values = bridge.getInsets().split(",").map(Number);
    if (values.length !== 4 || values.some((value) => !Number.isFinite(value))) {
      return;
    }

    const rootStyle = document.documentElement.style;
    INSET_PROPERTIES.forEach((property, index) => {
      rootStyle.setProperty(property, `${Math.max(0, values[index] ?? 0)}px`);
    });
  } catch {
    // Mantém os valores padrão (0px) caso a ponte nativa falhe.
  }
}

export function NativeInsetsSync() {
  useEffect(() => {
    if (!window.CoditNative) {
      return;
    }

    applyNativeInsets();
    const timers = REAPPLY_DELAYS_MS.map((delay) =>
      window.setTimeout(applyNativeInsets, delay),
    );

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        applyNativeInsets();
      }
    };

    window.addEventListener("resize", applyNativeInsets);
    window.addEventListener("orientationchange", applyNativeInsets);
    window.addEventListener("pageshow", applyNativeInsets);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
      window.removeEventListener("resize", applyNativeInsets);
      window.removeEventListener("orientationchange", applyNativeInsets);
      window.removeEventListener("pageshow", applyNativeInsets);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, []);

  return null;
}
