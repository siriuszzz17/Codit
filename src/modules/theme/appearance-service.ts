import type { User } from "@supabase/supabase-js";
import { z } from "zod";
import {
  requireSupabaseClient,
  type CoditSupabaseClient,
} from "@/lib/supabase/client";
import type {
  AppColorMode,
  AppThemeId,
  WallpaperIntensity,
  WallpaperPresetId,
} from "@/lib/supabase/database.types";
import { isSchemaMismatchError } from "@/lib/supabase/errors";
import { assertAuthenticatedUserMatches } from "@/lib/supabase/session-guard";
import {
  APP_COLOR_MODE_IDS,
  APP_THEME_IDS,
  DEFAULT_APPEARANCE_PREFS,
  WALLPAPER_INTENSITY_IDS,
  WALLPAPER_PRESET_IDS,
  type AppAppearancePrefs,
} from "@/modules/theme/appearance-catalog";

const APPEARANCE_GLOBAL_STORAGE_KEY = "codit:appearance:v1";
const APPEARANCE_USER_STORAGE_PREFIX = "codit:appearance:user:";

export const appearancePrefsSchema = z.object({
  colorMode: z.enum(APP_COLOR_MODE_IDS),
  appTheme: z.enum(APP_THEME_IDS),
  wallpaperPreset: z.enum(WALLPAPER_PRESET_IDS),
  wallpaperIntensity: z.enum(WALLPAPER_INTENSITY_IDS),
});

export class AppearanceServiceError extends Error {
  readonly code?: string | undefined;

  constructor(message: string, code?: string) {
    super(message);
    this.name = "AppearanceServiceError";
    this.code = code;
  }
}

function pickEnumValue<T extends string>(
  candidate: unknown,
  allowed: readonly T[],
  fallback: T,
): T {
  if (typeof candidate === "string" && allowed.includes(candidate as T)) {
    return candidate as T;
  }
  return fallback;
}

export function normalizeAppearancePrefs(raw: unknown): AppAppearancePrefs {
  if (!raw || typeof raw !== "object") {
    return { ...DEFAULT_APPEARANCE_PREFS };
  }

  const record = raw as Record<string, unknown>;
  const colorModeCandidate = record.colorMode ?? record.color_mode;
  const appThemeCandidate = record.appTheme ?? record.app_theme;
  const wallpaperCandidate =
    record.wallpaperPreset ?? record.wallpaper_preset;
  const intensityCandidate =
    record.wallpaperIntensity ?? record.wallpaper_intensity;

  return {
    colorMode: pickEnumValue<AppColorMode>(
      colorModeCandidate,
      APP_COLOR_MODE_IDS,
      DEFAULT_APPEARANCE_PREFS.colorMode,
    ),
    appTheme: pickEnumValue<AppThemeId>(
      appThemeCandidate,
      APP_THEME_IDS,
      DEFAULT_APPEARANCE_PREFS.appTheme,
    ),
    wallpaperPreset: pickEnumValue<WallpaperPresetId>(
      wallpaperCandidate,
      WALLPAPER_PRESET_IDS,
      DEFAULT_APPEARANCE_PREFS.wallpaperPreset,
    ),
    wallpaperIntensity: pickEnumValue<WallpaperIntensity>(
      intensityCandidate,
      WALLPAPER_INTENSITY_IDS,
      DEFAULT_APPEARANCE_PREFS.wallpaperIntensity,
    ),
  };
}

function getStorageKey(userId?: string | null): string {
  return userId
    ? `${APPEARANCE_USER_STORAGE_PREFIX}${userId}`
    : APPEARANCE_GLOBAL_STORAGE_KEY;
}

export function readLocalAppearance(
  userId?: string | null,
): AppAppearancePrefs | null {
  if (typeof window === "undefined" || !window.localStorage) {
    return null;
  }

  try {
    const raw =
      (userId ? window.localStorage.getItem(getStorageKey(userId)) : null) ??
      window.localStorage.getItem(APPEARANCE_GLOBAL_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    return normalizeAppearancePrefs(JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
}

export function writeLocalAppearance(
  prefs: AppAppearancePrefs,
  userId?: string | null,
): void {
  if (typeof window === "undefined" || !window.localStorage) {
    return;
  }

  const normalized = normalizeAppearancePrefs(prefs);
  const serialized = JSON.stringify(normalized);

  try {
    window.localStorage.setItem(APPEARANCE_GLOBAL_STORAGE_KEY, serialized);
    if (userId) {
      window.localStorage.setItem(getStorageKey(userId), serialized);
    }
  } catch {
    // Ignora falha de cota ou modo privado.
  }
}

export function applyAppearanceToDocument(
  prefs: AppAppearancePrefs,
  targetDoc: Document | undefined = typeof document !== "undefined"
    ? document
    : undefined,
): void {
  if (!targetDoc?.documentElement) {
    return;
  }

  const normalized = normalizeAppearancePrefs(prefs);
  const root = targetDoc.documentElement;
  root.setAttribute("data-color-mode", normalized.colorMode);
  root.setAttribute("data-ui-theme", normalized.appTheme);
  root.setAttribute("data-wallpaper", normalized.wallpaperPreset);
  root.setAttribute("data-wallpaper-intensity", normalized.wallpaperIntensity);
}

function readMetadataAppearance(
  user: Pick<User, "user_metadata">,
): AppAppearancePrefs | null {
  const metadata = user.user_metadata;
  if (!metadata || typeof metadata !== "object") {
    return null;
  }
  const candidate = (metadata as Record<string, unknown>).codit_appearance;
  if (!candidate || typeof candidate !== "object") {
    return null;
  }
  return normalizeAppearancePrefs(candidate);
}

export async function fetchUserAppearance(
  user: Pick<User, "id" | "user_metadata">,
  client: CoditSupabaseClient = requireSupabaseClient(),
): Promise<AppAppearancePrefs> {
  const localPrefs = readLocalAppearance(user.id);
  const metadataPrefs = readMetadataAppearance(user);

  const { data, error } = await client
    .from("profiles")
    .select("color_mode, app_theme, wallpaper_preset, wallpaper_intensity")
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    if (isSchemaMismatchError(error)) {
      return localPrefs ?? metadataPrefs ?? { ...DEFAULT_APPEARANCE_PREFS };
    }
    return localPrefs ?? metadataPrefs ?? { ...DEFAULT_APPEARANCE_PREFS };
  }

  if (!data) {
    return localPrefs ?? metadataPrefs ?? { ...DEFAULT_APPEARANCE_PREFS };
  }

  const normalized = normalizeAppearancePrefs(data);
  writeLocalAppearance(normalized, user.id);
  return normalized;
}

export async function persistUserAppearance(
  userId: string,
  prefs: AppAppearancePrefs,
  client: CoditSupabaseClient = requireSupabaseClient(),
): Promise<{ prefs: AppAppearancePrefs; syncedToDb: boolean }> {
  const normalized = normalizeAppearancePrefs(prefs);
  writeLocalAppearance(normalized, userId);

  await assertAuthenticatedUserMatches(
    userId,
    client,
    (message) => new AppearanceServiceError(message, "AUTH_USER_MISMATCH"),
  );

  const payload = {
    color_mode: normalized.colorMode,
    app_theme: normalized.appTheme,
    wallpaper_preset: normalized.wallpaperPreset,
    wallpaper_intensity: normalized.wallpaperIntensity,
  };

  const { error } = await client
    .from("profiles")
    .update(payload)
    .eq("id", userId);

  if (!error) {
    return { prefs: normalized, syncedToDb: true };
  }

  if (isSchemaMismatchError(error)) {
    try {
      if (typeof client.auth?.updateUser === "function") {
        await client.auth.updateUser({
          data: {
            codit_appearance: normalized,
          },
        });
      }
    } catch {
      // Fallback silencioso: já persistido localmente em localStorage.
    }
    return { prefs: normalized, syncedToDb: false };
  }

  throw new AppearanceServiceError(
    "Não foi possível salvar suas preferências de aparência na nuvem.",
    typeof (error as { code?: unknown }).code === "string"
      ? ((error as { code?: string }).code ?? undefined)
      : undefined,
  );
}
