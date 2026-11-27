"use client";

import { useEffect } from "react";
import { captureErrorEvent } from "@/lib/error-observability";

export function GlobalErrorObserver() {
  useEffect(() => {
    const handleWindowError = (event: ErrorEvent) => {
      void captureErrorEvent({
        source: "frontend",
        severity: "error",
        title: event.message || "Erro não tratado no navegador",
        message: event.error instanceof Error ? event.error.message : event.message || "Erro desconhecido",
        stack: event.error instanceof Error ? event.error.stack : null,
        context: {
          filename: event.filename,
          lineno: event.lineno,
          colno: event.colno,
        },
      });
    };

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      const message =
        reason instanceof Error
          ? reason.message
          : typeof reason === "string"
            ? reason
            : "Promise rejeitada sem tratamento";

      void captureErrorEvent({
        source: "frontend",
        severity: "error",
        title: "Unhandled Promise Rejection",
        message,
        stack: reason instanceof Error ? reason.stack : null,
      });
    };

    window.addEventListener("error", handleWindowError);
    window.addEventListener("unhandledrejection", handleUnhandledRejection);

    return () => {
      window.removeEventListener("error", handleWindowError);
      window.removeEventListener("unhandledrejection", handleUnhandledRejection);
    };
  }, []);

  return null;
}
