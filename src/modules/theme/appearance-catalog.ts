import type {
  AppColorMode,
  AppThemeId,
  WallpaperIntensity,
  WallpaperPresetId,
} from "@/lib/supabase/database.types";

export type WallpaperCategory = "original" | "tech" | "ambient" | "minimal";

export interface AppColorModeMeta {
  id: AppColorMode;
  label: string;
  description: string;
}

export interface AppThemeMeta {
  id: AppThemeId;
  label: string;
  description: string;
  swatchHex: string;
  secondaryHex: string;
}

export interface WallpaperPresetMeta {
  id: WallpaperPresetId;
  label: string;
  description: string;
  category: WallpaperCategory;
  previewClass: string;
}

export interface WallpaperIntensityMeta {
  id: WallpaperIntensity;
  label: string;
  description: string;
}

export interface AppAppearancePrefs {
  colorMode: AppColorMode;
  appTheme: AppThemeId;
  wallpaperPreset: WallpaperPresetId;
  wallpaperIntensity: WallpaperIntensity;
}

export const APP_COLOR_MODE_IDS: readonly AppColorMode[] = [
  "system",
  "light",
  "dark",
] as const;

export const APP_THEME_IDS: readonly AppThemeId[] = [
  "original",
  "ocean_circuit",
  "amber_terminal",
  "forest_syntax",
  "nordic_frost",
  "mono_graphite",
] as const;

export const WALLPAPER_PRESET_IDS: readonly WallpaperPresetId[] = [
  "original",
  "blueprint_grid",
  "circuit_traces",
  "topographic_flow",
  "constellation_nodes",
  "isometric_matrix",
  "aurora_mesh",
  "minimal_paper",
] as const;

export const WALLPAPER_INTENSITY_IDS: readonly WallpaperIntensity[] = [
  "subtle",
  "balanced",
  "vivid",
] as const;

export const DEFAULT_APPEARANCE_PREFS: AppAppearancePrefs = {
  colorMode: "system",
  appTheme: "original",
  wallpaperPreset: "original",
  wallpaperIntensity: "balanced",
};

export const APP_COLOR_MODES: readonly AppColorModeMeta[] = [
  {
    id: "system",
    label: "Sistema",
    description: "Segue a preferência clara ou escura do aparelho.",
  },
  {
    id: "light",
    label: "Claro",
    description: "Superfícies claras e nítidas para ambientes iluminados.",
  },
  {
    id: "dark",
    label: "Escuro",
    description: "Conforto visual noturno com ardósia profunda.",
  },
] as const;

const DEFAULT_APP_THEME: AppThemeMeta = {
  id: "original",
  label: "Original Codit",
  description: "Íris elétrico e turquesa com equilíbrio clássico.",
  swatchHex: "#6338F0",
  secondaryHex: "#0D9488",
};

export const APP_THEMES: readonly AppThemeMeta[] = [
  DEFAULT_APP_THEME,
  {
    id: "ocean_circuit",
    label: "Oceano Circuito",
    description: "Ciano técnico sobre azul abissal limpo.",
    swatchHex: "#0284C7",
    secondaryHex: "#06B6D4",
  },
  {
    id: "amber_terminal",
    label: "Âmbar Engenharia",
    description: "Cobre quente e grafite confortável para leitura.",
    swatchHex: "#D97706",
    secondaryHex: "#EA580C",
  },
  {
    id: "forest_syntax",
    label: "Floresta Sintaxe",
    description: "Esmeralda suave em base de ardósia botânica.",
    swatchHex: "#059669",
    secondaryHex: "#10B981",
  },
  {
    id: "nordic_frost",
    label: "Gelo Nórdico",
    description: "Azul polar limpo para longas sessões de código.",
    swatchHex: "#3B82F6",
    secondaryHex: "#60A5FA",
  },
  {
    id: "mono_graphite",
    label: "Grafite Editorial",
    description: "Monocromático neutro focado em tipografia.",
    swatchHex: "#3F475B",
    secondaryHex: "#64748B",
  },
] as const;

const DEFAULT_WALLPAPER_PRESET: WallpaperPresetMeta = {
  id: "original",
  label: "Padrão Original",
  description: "Luz atmosférica suave original do Codit.",
  category: "original",
  previewClass: "codit-wp-preview-original",
};

export const WALLPAPER_PRESETS: readonly WallpaperPresetMeta[] = [
  DEFAULT_WALLPAPER_PRESET,
  {
    id: "blueprint_grid",
    label: "Planta Técnica",
    description: "Grade milimetrada leve inspirada em engenharia.",
    category: "tech",
    previewClass: "codit-wp-preview-blueprint",
  },
  {
    id: "circuit_traces",
    label: "Trilhas de Circuito",
    description: "Traços ortogonais discretos estilo placa lógica.",
    category: "tech",
    previewClass: "codit-wp-preview-circuit",
  },
  {
    id: "topographic_flow",
    label: "Mapa Topográfico",
    description: "Curvas orgânicas contínuas de baixa opacidade.",
    category: "ambient",
    previewClass: "codit-wp-preview-topographic",
  },
  {
    id: "constellation_nodes",
    label: "Rede de Nós",
    description: "Pontos e conexões inspirados em grafos de dados.",
    category: "tech",
    previewClass: "codit-wp-preview-constellation",
  },
  {
    id: "isometric_matrix",
    label: "Grade Isométrica",
    description: "Malha geométrica em 60 graus com ritmo suave.",
    category: "tech",
    previewClass: "codit-wp-preview-isometric",
  },
  {
    id: "aurora_mesh",
    label: "Nebulosa Boreal",
    description: "Gradientes difusos sem linhas geométricas.",
    category: "ambient",
    previewClass: "codit-wp-preview-aurora",
  },
  {
    id: "minimal_paper",
    label: "Liso Puro",
    description: "Fundo sólido sem textura para foco total.",
    category: "minimal",
    previewClass: "codit-wp-preview-minimal",
  },
] as const;

export const WALLPAPER_INTENSITIES: readonly WallpaperIntensityMeta[] = [
  {
    id: "subtle",
    label: "Suave",
    description: "Textura quase imperceptível",
  },
  {
    id: "balanced",
    label: "Equilibrado",
    description: "Presença leve sem cansar",
  },
  {
    id: "vivid",
    label: "Marcante",
    description: "Mais visível sob os painéis",
  },
] as const;

export function getAppThemeMeta(themeId: AppThemeId): AppThemeMeta {
  return APP_THEMES.find((item) => item.id === themeId) ?? DEFAULT_APP_THEME;
}

export function getWallpaperPresetMeta(
  presetId: WallpaperPresetId,
): WallpaperPresetMeta {
  return (
    WALLPAPER_PRESETS.find((item) => item.id === presetId) ??
    DEFAULT_WALLPAPER_PRESET
  );
}

export function isDefaultAppearance(prefs: AppAppearancePrefs): boolean {
  return (
    prefs.colorMode === DEFAULT_APPEARANCE_PREFS.colorMode &&
    prefs.appTheme === DEFAULT_APPEARANCE_PREFS.appTheme &&
    prefs.wallpaperPreset === DEFAULT_APPEARANCE_PREFS.wallpaperPreset &&
    prefs.wallpaperIntensity === DEFAULT_APPEARANCE_PREFS.wallpaperIntensity
  );
}
