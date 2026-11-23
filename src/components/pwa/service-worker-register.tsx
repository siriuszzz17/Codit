"use client";

import { useEffect } from "react";

export function ServiceWorkerRegister() {
  useEffect(() => {
    if (
      process.env.NODE_ENV !== "production" ||
      typeof window === "undefined" ||
      !("serviceWorker" in navigator)
    ) {
      return;
    }

    const isNativeShell =
      "__TAURI_INTERNALS__" in window ||
      Boolean(
        (
          window as Window & {
            Capacitor?: { isNativePlatform?: () => boolean };
          }
        ).Capacitor?.isNativePlatform?.(),
      );

    if (isNativeShell) {
      return;
    }

    navigator.serviceWorker
      .register("/sw.js", {
        scope: "/",
        updateViaCache: "none",
      })
      .catch(() => {
        // Falha silenciosa no registro em segundo plano para não bloquear a navegação.
      });
  }, []);

  return null;
}
