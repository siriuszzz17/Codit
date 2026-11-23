import { z } from "zod";
import {
  checkForDesktopUpdate,
  isTauriDesktop,
  relaunchDesktopApp,
} from "./desktop-updater";

export const CURRENT_APP_VERSION =
  process.env.NEXT_PUBLIC_APP_VERSION ?? "0.1.1";

export const RELEASE_MANIFEST_URL =
  "https://github.com/siriuszzz17/Codit/releases/latest/download/latest.json";

export const GITHUB_LATEST_RELEASE_API_URL =
  "https://api.github.com/repos/siriuszzz17/Codit/releases/latest";

const SEMVER_PATTERN = /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:[-+].+)?$/i;

const releaseManifestSchema = z.object({
  version: z.string().trim().min(1),
  notes: z.string().optional(),
  pub_date: z.string().optional(),
  android: z
    .object({
      url: z.string().trim().min(1),
    })
    .optional(),
});

const githubReleaseApiSchema = z.object({
  tag_name: z.string().trim().min(1),
  body: z.string().nullable().optional(),
  published_at: z.string().nullable().optional(),
  assets: z
    .array(
      z.object({
        name: z.string(),
        browser_download_url: z.string(),
      }),
    )
    .default([]),
});

export type ReleaseManifest = z.infer<typeof releaseManifestSchema>;

export interface DesktopDownloadProgress {
  downloadedBytes: number;
  totalBytes?: number;
  percent?: number;
  finished: boolean;
}

export interface DesktopAppUpdate {
  platform: "desktop";
  version: string;
  currentVersion: string;
  notes?: string;
  date?: string;
  downloadAndInstall: (
    onProgress?: (progress: DesktopDownloadProgress) => void,
  ) => Promise<void>;
  relaunch: () => Promise<void>;
  dismiss: () => Promise<void>;
}

export interface AndroidAppUpdate {
  platform: "android";
  version: string;
  currentVersion: string;
  notes?: string;
  date?: string;
  downloadUrl: string;
}

export type AppUpdate = DesktopAppUpdate | AndroidAppUpdate;

interface CapacitorWindow extends Window {
  Capacitor?: {
    isNativePlatform?: () => boolean;
    getPlatform?: () => string;
  };
}

/**
 * Parses a semantic version string (e.g. "0.1.0" or "v1.2.3-rc.1") into
 * a [major, minor, patch] tuple, or returns null when invalid.
 */
export function parseSemver(
  version: string,
): readonly [number, number, number] | null {
  const match = SEMVER_PATTERN.exec(version.trim());
  if (!match) {
    return null;
  }

  const major = Number(match[1]);
  const minor = Number(match[2]);
  const patch = Number(match[3]);

  if (
    !Number.isSafeInteger(major) ||
    !Number.isSafeInteger(minor) ||
    !Number.isSafeInteger(patch)
  ) {
    return null;
  }

  return [major, minor, patch];
}

/**
 * Returns true only when candidate represents a strictly higher semver than current.
 */
export function isNewerVersion(candidate: string, current: string): boolean {
  const parsedCandidate = parseSemver(candidate);
  const parsedCurrent = parseSemver(current);
  if (!parsedCandidate || !parsedCurrent) {
    return false;
  }

  for (let index = 0; index < 3; index += 1) {
    const nextPart = parsedCandidate[index] ?? 0;
    const currentPart = parsedCurrent[index] ?? 0;
    if (nextPart > currentPart) {
      return true;
    }
    if (nextPart < currentPart) {
      return false;
    }
  }

  return false;
}

/**
 * Validates that a release download URL uses HTTPS on the official Codit GitHub Releases path.
 */
export function isAllowedReleaseDownloadUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    return (
      parsed.protocol === "https:" &&
      parsed.hostname === "github.com" &&
      parsed.pathname.startsWith("/siriuszzz17/Codit/releases/")
    );
  } catch {
    return false;
  }
}

/**
 * Parses and validates a static release manifest (latest.json).
 */
export function parseReleaseManifest(raw: unknown): ReleaseManifest | null {
  const parsed = releaseManifestSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/**
 * Returns true only when running inside the Capacitor Android native shell.
 */
export function isCapacitorAndroid(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  const capacitor = (window as CapacitorWindow).Capacitor;
  return (
    capacitor?.isNativePlatform?.() === true &&
    capacitor.getPlatform?.() === "android"
  );
}

async function fetchAndroidUpdateFromManifest(
  currentVersion: string,
): Promise<AndroidAppUpdate | null> {
  try {
    const { CapacitorHttp } = await import("@capacitor/core");
    const response = await CapacitorHttp.get({
      url: RELEASE_MANIFEST_URL,
      responseType: "text",
      connectTimeout: 8000,
      readTimeout: 8000,
    });

    if (response.status < 200 || response.status >= 300) {
      return null;
    }

    const payload: unknown =
      typeof response.data === "string"
        ? JSON.parse(response.data)
        : response.data;
    const manifest = parseReleaseManifest(payload);
    if (!manifest || !isNewerVersion(manifest.version, currentVersion)) {
      return null;
    }

    const downloadUrl = manifest.android?.url;
    if (!downloadUrl || !isAllowedReleaseDownloadUrl(downloadUrl)) {
      return null;
    }

    return {
      platform: "android",
      version: manifest.version.replace(/^v/i, ""),
      currentVersion,
      ...(manifest.notes !== undefined ? { notes: manifest.notes } : {}),
      ...(manifest.pub_date !== undefined ? { date: manifest.pub_date } : {}),
      downloadUrl,
    };
  } catch {
    return null;
  }
}

async function fetchAndroidUpdateFromGitHubApi(
  currentVersion: string,
): Promise<AndroidAppUpdate | null> {
  try {
    const response = await fetch(GITHUB_LATEST_RELEASE_API_URL, {
      headers: {
        Accept: "application/vnd.github+json",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      return null;
    }

    const rawJson: unknown = await response.json();
    const parsed = githubReleaseApiSchema.safeParse(rawJson);
    if (!parsed.success) {
      return null;
    }

    const release = parsed.data;
    if (!isNewerVersion(release.tag_name, currentVersion)) {
      return null;
    }

    const apkAsset = release.assets.find(
      (asset) =>
        asset.name.toLowerCase().endsWith(".apk") &&
        isAllowedReleaseDownloadUrl(asset.browser_download_url),
    );
    if (!apkAsset) {
      return null;
    }

    return {
      platform: "android",
      version: release.tag_name.replace(/^v/i, ""),
      currentVersion,
      ...(release.body ? { notes: release.body } : {}),
      ...(release.published_at ? { date: release.published_at } : {}),
      downloadUrl: apkAsset.browser_download_url,
    };
  } catch {
    return null;
  }
}

/**
 * Checks for an Android APK update from the release manifest (via native CapacitorHttp
 * to bypass WebView CORS), falling back to the GitHub Releases REST API.
 */
export async function checkForAndroidUpdate(
  currentVersion: string = CURRENT_APP_VERSION,
): Promise<AndroidAppUpdate | null> {
  if (!isCapacitorAndroid()) {
    return null;
  }

  const fromManifest = await fetchAndroidUpdateFromManifest(currentVersion);
  if (fromManifest) {
    return fromManifest;
  }

  return fetchAndroidUpdateFromGitHubApi(currentVersion);
}

/**
 * Checks for an available app update across Tauri Desktop and Capacitor Android.
 * Returns null on Web/PWA or when already on the latest version.
 */
export async function checkForAppUpdate(
  currentVersion: string = CURRENT_APP_VERSION,
): Promise<AppUpdate | null> {
  if (isTauriDesktop()) {
    const update = await checkForDesktopUpdate();
    if (!update) {
      return null;
    }

    return {
      platform: "desktop",
      version: update.version,
      currentVersion: update.currentVersion,
      ...(update.body !== undefined ? { notes: update.body } : {}),
      ...(update.date !== undefined ? { date: update.date } : {}),
      downloadAndInstall: async (onProgress) => {
        let downloadedBytes = 0;
        let totalBytes: number | undefined;

        await update.downloadAndInstall((event) => {
          if (event.event === "Started") {
            totalBytes = event.data.contentLength;
            onProgress?.({
              downloadedBytes,
              ...(totalBytes !== undefined ? { totalBytes } : {}),
              ...(totalBytes && totalBytes > 0 ? { percent: 0 } : {}),
              finished: false,
            });
            return;
          }

          if (event.event === "Progress") {
            downloadedBytes += event.data.chunkLength;
            const percent =
              totalBytes && totalBytes > 0
                ? Math.min(
                    100,
                    Math.round((downloadedBytes / totalBytes) * 100),
                  )
                : undefined;
            onProgress?.({
              downloadedBytes,
              ...(totalBytes !== undefined ? { totalBytes } : {}),
              ...(percent !== undefined ? { percent } : {}),
              finished: false,
            });
            return;
          }

          if (event.event === "Finished") {
            onProgress?.({
              downloadedBytes,
              ...(totalBytes !== undefined ? { totalBytes } : {}),
              ...(totalBytes && totalBytes > 0 ? { percent: 100 } : {}),
              finished: true,
            });
          }
        });
      },
      relaunch: relaunchDesktopApp,
      dismiss: update.close,
    };
  }

  if (isCapacitorAndroid()) {
    return checkForAndroidUpdate(currentVersion);
  }

  return null;
}
