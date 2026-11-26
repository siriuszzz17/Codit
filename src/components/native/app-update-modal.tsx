"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { OctopyBadge } from "@/components/brand/octopy-badge";
import { useDialogA11y } from "@/hooks/use-dialog-a11y";
import {
  checkForAppUpdate,
  type AppUpdate,
  type DesktopDownloadProgress,
} from "@/lib/app-updater";

type UpdatePhase = "prompt" | "downloading" | "installing" | "error";

const DISMISSED_VERSION_KEY = "codit:dismissed-update-version";

function readDismissedVersion(): string | null {
  try {
    return window.sessionStorage.getItem(DISMISSED_VERSION_KEY);
  } catch {
    return null;
  }
}

function saveDismissedVersion(version: string): void {
  try {
    window.sessionStorage.setItem(DISMISSED_VERSION_KEY, version);
  } catch {
    // Ignora falhas de armazenamento em ambientes restritos.
  }
}

function formatMegabytes(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function AppUpdateModal() {
  const [update, setUpdate] = useState<AppUpdate | null>(null);
  const [phase, setPhase] = useState<UpdatePhase>("prompt");
  const [progress, setProgress] = useState<DesktopDownloadProgress | null>(
    null,
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);

  useDialogA11y({
    open: Boolean(update),
    containerRef: dialogRef,
    onClose: () => {
      if (update && phase !== "downloading" && phase !== "installing") {
        saveDismissedVersion(update.version);
        setUpdate(null);
      }
    },
  });

  useEffect(() => {
    let cancelled = false;
    let checking = false;
    let lastCheckedAt = 0;

    async function runCheck(force = false) {
      const now = Date.now();
      if (
        checking ||
        (typeof navigator !== "undefined" && !navigator.onLine) ||
        (!force && now - lastCheckedAt < 5 * 60 * 1000)
      ) {
        return;
      }

      checking = true;
      lastCheckedAt = now;
      try {
        const available = await checkForAppUpdate();
        if (cancelled || !available) {
          return;
        }

        if (readDismissedVersion() === available.version) {
          if (available.platform === "desktop" && available.mode === "native") {
            void available.dismiss();
          }
          return;
        }

        setUpdate(available);
        setPhase("prompt");
        setProgress(null);
        setErrorMessage(null);
      } finally {
        checking = false;
      }
    }

    function handleOnline() {
      void runCheck(true);
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        void runCheck();
      }
    }

    void runCheck(true);
    const interval = window.setInterval(() => void runCheck(), 5 * 60 * 1000);
    window.addEventListener("online", handleOnline);
    window.addEventListener("focus", handleVisibilityChange);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("focus", handleVisibilityChange);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  useEffect(() => {
    if (!update || phase === "downloading" || phase === "installing") {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape" || !update) {
        return;
      }

      saveDismissedVersion(update.version);
      if (update.platform === "desktop" && update.mode === "native") {
        void update.dismiss();
      }
      setUpdate(null);
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [update, phase]);

  if (!update) {
    return null;
  }

  const isBusy = phase === "downloading" || phase === "installing";

  function handleDismiss() {
    if (!update || isBusy) {
      return;
    }

    saveDismissedVersion(update.version);
    if (update.platform === "desktop" && update.mode === "native") {
      void update.dismiss();
    }
    setUpdate(null);
  }

  async function handleDesktopInstall() {
    if (
      !update ||
      update.platform !== "desktop" ||
      update.mode !== "native" ||
      isBusy
    ) {
      return;
    }

    setPhase("downloading");
    setErrorMessage(null);
    setProgress({ downloadedBytes: 0, finished: false });

    try {
      await update.downloadAndInstall((nextProgress) => {
        setProgress(nextProgress);
        if (nextProgress.finished) {
          setPhase("installing");
        }
      });

      setPhase("installing");
      await update.relaunch();
    } catch {
      setPhase("error");
      setErrorMessage(
        "Não foi possível concluir a atualização. Verifique sua conexão e tente novamente.",
      );
    }
  }

  const progressPercent = progress?.percent;
  const progressText =
    phase === "installing"
      ? "Instalando e reiniciando o Codit..."
      : progressPercent !== undefined
        ? `Baixando atualização... ${progressPercent}%`
        : progress && progress.downloadedBytes > 0
          ? `Baixando atualização... (${formatMegabytes(progress.downloadedBytes)})`
          : "Preparando download...";

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="codit-update-title"
      aria-describedby="codit-update-description"
      className="codit-safe-modal fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-xs sm:items-center"
    >
      <div
        ref={dialogRef}
        className="max-h-[calc(100dvh-var(--codit-safe-top)-var(--codit-safe-bottom)-1.5rem)] w-full max-w-md overflow-y-auto space-y-4 rounded-2xl border border-border bg-surface-elevated p-5 shadow-xl sm:max-h-[calc(100dvh-3rem)] sm:p-6"
      >
        <div className="flex items-start gap-3">
          <OctopyBadge size={40} className="shrink-0 rounded-xl shadow-xs" />
          <div className="min-w-0 flex-1 space-y-1">
            <span className="inline-block rounded-lg bg-accent-soft px-2.5 py-0.5 text-[11px] font-semibold text-accent-strong">
              Atualização disponível
            </span>
            <h2
              id="codit-update-title"
              className="text-lg font-bold tracking-tight text-foreground"
            >
              Nova versão do Codit (v{update.version})
            </h2>
            <p
              id="codit-update-description"
              className="text-xs text-muted"
            >
              Versão instalada: v{update.currentVersion}
            </p>
          </div>
        </div>

        {update.notes ? (
          <div className="max-h-36 overflow-y-auto rounded-xl border border-border bg-surface-muted/70 px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-line text-foreground">
            {update.notes}
          </div>
        ) : null}

        {update.platform === "desktop" &&
        update.mode === "native" &&
        isBusy ? (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted">{progressText}</p>
            <div
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progressPercent ?? 0}
              className="h-2.5 w-full overflow-hidden rounded-full bg-surface-muted"
            >
              <div
                className="h-full rounded-full bg-accent transition-all duration-200"
                style={{
                  width: `${phase === "installing" ? 100 : (progressPercent ?? 35)}%`,
                }}
              />
            </div>
          </div>
        ) : null}

        {update.platform === "android" ? (
          <p className="rounded-xl border border-border bg-surface-muted/50 px-3.5 py-2.5 text-xs leading-relaxed text-muted">
            Após o download do arquivo <strong className="text-foreground">.apk</strong>,
            toque nele e confirme <strong className="text-foreground">&ldquo;Atualizar&rdquo;</strong>{" "}
            no Android.
          </p>
        ) : null}

        {errorMessage ? (
          <p
            role="alert"
            className="rounded-xl border border-red-500/40 bg-red-500/10 px-3.5 py-2.5 text-xs font-medium text-foreground"
          >
            {errorMessage}
          </p>
        ) : null}

        <div className="flex flex-col-reverse gap-2.5 pt-1 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={handleDismiss}
            disabled={isBusy}
            className="inline-flex min-h-11 items-center justify-center rounded-xl border border-border bg-surface-muted px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:border-accent disabled:cursor-not-allowed disabled:opacity-50"
          >
            {phase === "error" ? "Fechar" : "Agora não"}
          </button>

          {update.platform === "desktop" && update.mode === "native" ? (
            <button
              type="button"
              onClick={() => void handleDesktopInstall()}
              disabled={isBusy}
              className="inline-flex min-h-11 items-center justify-center rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-accent-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {phase === "error"
                ? "Tentar novamente"
                : isBusy
                  ? "Atualizando..."
                  : "Atualizar agora"}
            </button>
          ) : update.platform === "desktop" ? (
            <a
              href={update.downloadUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => saveDismissedVersion(update.version)}
              className="inline-flex min-h-11 items-center justify-center rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-accent-foreground transition-opacity hover:opacity-90"
            >
              Baixar instalador (.exe)
            </a>
          ) : (
            <a
              href={update.downloadUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => saveDismissedVersion(update.version)}
              className="inline-flex min-h-11 items-center justify-center rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-accent-foreground transition-opacity hover:opacity-90"
            >
              Baixar atualização (.apk)
            </a>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
