import type { DownloadEvent, Update } from "@tauri-apps/plugin-updater";
import { logWarn } from "@/lib/logger";

export interface DesktopUpdateInfo {
  version: string;
  currentVersion: string;
  date?: string;
  body?: string;
  downloadAndInstall: (
    onEvent?: (progress: DownloadEvent) => void,
  ) => Promise<void>;
  close: () => Promise<void>;
}

/**
 * Returns true only when running inside the Tauri desktop WebView runtime.
 */
export function isTauriDesktop(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function mapUpdate(update: Update): DesktopUpdateInfo {
  return {
    version: update.version,
    currentVersion: update.currentVersion,
    ...(update.date !== undefined ? { date: update.date } : {}),
    ...(update.body !== undefined ? { body: update.body } : {}),
    downloadAndInstall: (onEvent) => update.downloadAndInstall(onEvent),
    close: () => update.close(),
  };
}

/**
 * Checks for an application update via tauri-plugin-updater when running in
 * Tauri desktop. Returns null on Web/Android or when the updater plugin is
 * not yet configured with a signing key.
 */
export async function checkForDesktopUpdate(): Promise<DesktopUpdateInfo | null> {
  if (!isTauriDesktop()) {
    return null;
  }

  try {
    const { check } = await import("@tauri-apps/plugin-updater");
    const update = await check();
    return update ? mapUpdate(update) : null;
  } catch (error) {
    logWarn("desktop_updater.check_failed", { error });
    return null;
  }
}

/**
 * Relaunches the desktop application after an update is installed.
 */
export async function relaunchDesktopApp(): Promise<void> {
  if (!isTauriDesktop()) {
    return;
  }

  const { relaunch } = await import("@tauri-apps/plugin-process");
  await relaunch();
}
