import { afterEach, describe, expect, it, vi } from "vitest";
import type { CoditSupabaseClient } from "@/lib/supabase/client";
import {
  APP_COLOR_MODE_IDS,
  APP_THEME_IDS,
  DEFAULT_APPEARANCE_PREFS,
  isDefaultAppearance,
  WALLPAPER_INTENSITY_IDS,
  WALLPAPER_PRESET_IDS,
} from "@/modules/theme/appearance-catalog";
import {
  AppearanceServiceError,
  appearancePrefsSchema,
  applyAppearanceToDocument,
  fetchUserAppearance,
  normalizeAppearancePrefs,
  persistUserAppearance,
  readLocalAppearance,
  writeLocalAppearance,
} from "@/modules/theme/appearance-service";

describe("appearance theme & wallpaper system", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("validates supported modes, themes, wallpapers and falls back safely for unknown values", () => {
    expect(APP_COLOR_MODE_IDS).toContain("system");
    expect(APP_THEME_IDS).toContain("original");
    expect(WALLPAPER_PRESET_IDS).toContain("original");
    expect(WALLPAPER_INTENSITY_IDS).toContain("balanced");
    expect(isDefaultAppearance(DEFAULT_APPEARANCE_PREFS)).toBe(true);

    const parsed = appearancePrefsSchema.safeParse({
      colorMode: "dark",
      appTheme: "ocean_circuit",
      wallpaperPreset: "blueprint_grid",
      wallpaperIntensity: "vivid",
    });
    expect(parsed.success).toBe(true);

    const normalizedSnake = normalizeAppearancePrefs({
      color_mode: "light",
      app_theme: "amber_terminal",
      wallpaper_preset: "topographic_flow",
      wallpaper_intensity: "subtle",
    });
    expect(normalizedSnake).toEqual({
      colorMode: "light",
      appTheme: "amber_terminal",
      wallpaperPreset: "topographic_flow",
      wallpaperIntensity: "subtle",
    });
    expect(isDefaultAppearance(normalizedSnake)).toBe(false);

    const normalizedInvalid = normalizeAppearancePrefs({
      colorMode: "invalid-mode",
      appTheme: "unknown-theme",
      wallpaperPreset: "hacked-url",
      wallpaperIntensity: 999,
    });
    expect(normalizedInvalid).toEqual(DEFAULT_APPEARANCE_PREFS);
  });

  it("reads/writes local preferences and applies data attributes to the document root", () => {
    const store = new Map<string, string>();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => {
          store.set(key, value);
        },
      },
    });

    const customPrefs = {
      colorMode: "dark" as const,
      appTheme: "forest_syntax" as const,
      wallpaperPreset: "circuit_traces" as const,
      wallpaperIntensity: "vivid" as const,
    };

    writeLocalAppearance(customPrefs, "user-1");
    expect(readLocalAppearance("user-1")).toEqual(customPrefs);
    expect(readLocalAppearance(null)).toEqual(customPrefs);

    const attrs = new Map<string, string>();
    const fakeDocument = {
      documentElement: {
        setAttribute: (name: string, value: string) => {
          attrs.set(name, value);
        },
      },
    } as unknown as Document;

    applyAppearanceToDocument(customPrefs, fakeDocument);
    expect(attrs.get("data-color-mode")).toBe("dark");
    expect(attrs.get("data-ui-theme")).toBe("forest_syntax");
    expect(attrs.get("data-wallpaper")).toBe("circuit_traces");
    expect(attrs.get("data-wallpaper-intensity")).toBe("vivid");
  });

  it("blocks cross-user persistence (RN-003), updates DB when migrated, and falls back on PGRST204", async () => {
    const store = new Map<string, string>();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => {
          store.set(key, value);
        },
      },
    });

    const mismatchedClient = {
      auth: {
        getSession: vi.fn().mockResolvedValue({
          data: { session: { user: { id: "user-B" } } },
          error: null,
        }),
      },
      from: vi.fn(),
    } as unknown as CoditSupabaseClient;

    await expect(
      persistUserAppearance(
        "user-A",
        DEFAULT_APPEARANCE_PREFS,
        mismatchedClient,
      ),
    ).rejects.toMatchObject({
      name: "AppearanceServiceError",
      code: "AUTH_USER_MISMATCH",
    } satisfies Partial<AppearanceServiceError>);

    // Banco com colunas da migração 20261124000003
    const eqUpdate = vi.fn().mockResolvedValue({ error: null });
    const update = vi.fn().mockReturnValue({ eq: eqUpdate });
    const dbClient = {
      auth: {
        getSession: vi.fn().mockResolvedValue({
          data: { session: { user: { id: "user-A" } } },
          error: null,
        }),
      },
      from: vi.fn().mockReturnValue({ update }),
    } as unknown as CoditSupabaseClient;

    const prefsToSave = {
      colorMode: "light" as const,
      appTheme: "nordic_frost" as const,
      wallpaperPreset: "constellation_nodes" as const,
      wallpaperIntensity: "balanced" as const,
    };

    const dbResult = await persistUserAppearance(
      "user-A",
      prefsToSave,
      dbClient,
    );
    expect(dbResult.syncedToDb).toBe(true);
    expect(update).toHaveBeenCalledWith({
      color_mode: "light",
      app_theme: "nordic_frost",
      wallpaper_preset: "constellation_nodes",
      wallpaper_intensity: "balanced",
    });
    expect(eqUpdate).toHaveBeenCalledWith("id", "user-A");

    // Fallback silencioso para auth.updateUser quando migração ainda não foi aplicada (PGRST204)
    const eqMissing = vi.fn().mockResolvedValue({
      error: {
        code: "PGRST204",
        message: "Could not find the 'wallpaper_preset' column of 'profiles'",
      },
    });
    const updateUser = vi.fn().mockResolvedValue({ data: {}, error: null });
    const legacyClient = {
      auth: {
        getSession: vi.fn().mockResolvedValue({
          data: { session: { user: { id: "user-A" } } },
          error: null,
        }),
        updateUser,
      },
      from: vi.fn().mockReturnValue({
        update: vi.fn().mockReturnValue({ eq: eqMissing }),
      }),
    } as unknown as CoditSupabaseClient;

    const legacyResult = await persistUserAppearance(
      "user-A",
      prefsToSave,
      legacyClient,
    );
    expect(legacyResult.syncedToDb).toBe(false);
    expect(updateUser).toHaveBeenCalledWith({
      data: { codit_appearance: prefsToSave },
    });

    // fetchUserAppearance lê do banco quando disponível
    const maybeSingle = vi.fn().mockResolvedValue({
      data: {
        color_mode: "dark",
        app_theme: "mono_graphite",
        wallpaper_preset: "isometric_matrix",
        wallpaper_intensity: "subtle",
      },
      error: null,
    });
    const fetchClient = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({ maybeSingle }),
        }),
      }),
    } as unknown as CoditSupabaseClient;

    const loaded = await fetchUserAppearance(
      { id: "user-A", user_metadata: {} },
      fetchClient,
    );
    expect(loaded).toEqual({
      colorMode: "dark",
      appTheme: "mono_graphite",
      wallpaperPreset: "isometric_matrix",
      wallpaperIntensity: "subtle",
    });
  });
});
