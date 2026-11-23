import type {
  OctopyCompanionMood,
  ProfileAccentTheme,
  ProfileAvatarFrame,
  ProfileBannerPreset,
  SandboxLanguage,
} from "@/lib/supabase/database.types";

export interface BannerPresetMeta {
  id: ProfileBannerPreset;
  label: string;
  description: string;
  gradientClass: string;
  patternClass: string;
}

export interface AccentThemeMeta {
  id: ProfileAccentTheme;
  label: string;
  swatchHex: string;
  ringClass: string;
  badgeClass: string;
  buttonClass: string;
  textClass: string;
  borderClass: string;
  softBgClass: string;
  cssVars: {
    "--profile-accent": string;
    "--profile-accent-soft": string;
    "--profile-accent-text": string;
  };
}

export interface AvatarFrameMeta {
  id: ProfileAvatarFrame;
  label: string;
  wrapperClass: string;
}

export interface OctopyCompanionMeta {
  id: OctopyCompanionMood;
  label: string;
  tagline: string;
}

export interface CuratedAvatarPreset {
  id: OctopyCompanionMood;
  label: string;
  src: string;
  variant: OctopyCompanionMood;
}

export interface SuggestedSkillItem {
  label: string;
  language?: SandboxLanguage;
}

export const PROFILE_BANNER_IDS: readonly ProfileBannerPreset[] = [
  "nebula",
  "aurora",
  "midnight_grid",
  "sunset_code",
  "emerald_matrix",
  "cyber_ocean",
] as const;

export const PROFILE_ACCENT_IDS: readonly ProfileAccentTheme[] = [
  "violet",
  "cyan",
  "emerald",
  "amber",
  "rose",
  "indigo",
] as const;

export const PROFILE_AVATAR_FRAME_IDS: readonly ProfileAvatarFrame[] = [
  "glow",
  "gradient",
  "pixel",
  "emerald",
  "none",
] as const;

export const OCTOPY_COMPANION_IDS: readonly OctopyCompanionMood[] = [
  "default",
  "coding",
  "headphones",
  "happy",
] as const;

export const PROFILE_BANNERS: Record<ProfileBannerPreset, BannerPresetMeta> = {
  nebula: {
    id: "nebula",
    label: "Nebulosa Octopy",
    description: "Roxo vibrante com brilho galáctico Codit",
    gradientClass:
      "bg-gradient-to-br from-[#2b1055] via-[#6d28d9] to-[#141128]",
    patternClass: "codit-pattern-dots",
  },
  aurora: {
    id: "aurora",
    label: "Aurora Tech",
    description: "Turquesa, violeta e verde boreal",
    gradientClass:
      "bg-gradient-to-r from-[#0f172a] via-[#0e7490] to-[#6d28d9]",
    patternClass: "codit-pattern-grid",
  },
  midnight_grid: {
    id: "midnight_grid",
    label: "Grade Noturna",
    description: "Estilo terminal dark com grade sutil",
    gradientClass:
      "bg-gradient-to-br from-[#09090b] via-[#1e1b4b] to-[#312e81]",
    patternClass: "codit-pattern-grid",
  },
  sunset_code: {
    id: "sunset_code",
    label: "Pôr do Sol Dev",
    description: "Âmbar, coral e púrpura quente",
    gradientClass:
      "bg-gradient-to-r from-[#7c2d12] via-[#db2777] to-[#4c1d95]",
    patternClass: "codit-pattern-dots",
  },
  emerald_matrix: {
    id: "emerald_matrix",
    label: "Matriz Esmeralda",
    description: "Verde código com profundidade escura",
    gradientClass:
      "bg-gradient-to-br from-[#022c22] via-[#059669] to-[#0f172a]",
    patternClass: "codit-pattern-grid",
  },
  cyber_ocean: {
    id: "cyber_ocean",
    label: "Oceano Ciano",
    description: "Azul profundo com brilho elétrico",
    gradientClass:
      "bg-gradient-to-br from-[#082f49] via-[#0284c7] to-[#312e81]",
    patternClass: "codit-pattern-dots",
  },
};

export const PROFILE_ACCENT_THEMES: Record<
  ProfileAccentTheme,
  AccentThemeMeta
> = {
  violet: {
    id: "violet",
    label: "Roxo Octopy",
    swatchHex: "#7c3aed",
    ringClass: "ring-violet-500/40",
    badgeClass: "bg-violet-500/15 text-violet-700 dark:text-violet-300 border-violet-500/35",
    buttonClass: "bg-violet-600 text-white hover:bg-violet-500",
    textClass: "text-violet-600 dark:text-violet-300",
    borderClass: "border-violet-500/40",
    softBgClass: "bg-violet-500/10",
    cssVars: {
      "--profile-accent": "#7c3aed",
      "--profile-accent-soft": "rgba(124, 58, 237, 0.14)",
      "--profile-accent-text": "#8b5cf6",
    },
  },
  cyan: {
    id: "cyan",
    label: "Ciano Neon",
    swatchHex: "#06b6d4",
    ringClass: "ring-cyan-500/40",
    badgeClass: "bg-cyan-500/15 text-cyan-700 dark:text-cyan-300 border-cyan-500/35",
    buttonClass: "bg-cyan-600 text-white hover:bg-cyan-500",
    textClass: "text-cyan-600 dark:text-cyan-300",
    borderClass: "border-cyan-500/40",
    softBgClass: "bg-cyan-500/10",
    cssVars: {
      "--profile-accent": "#06b6d4",
      "--profile-accent-soft": "rgba(6, 182, 212, 0.14)",
      "--profile-accent-text": "#22d3ee",
    },
  },
  emerald: {
    id: "emerald",
    label: "Esmeralda",
    swatchHex: "#10b981",
    ringClass: "ring-emerald-500/40",
    badgeClass: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/35",
    buttonClass: "bg-emerald-600 text-white hover:bg-emerald-500",
    textClass: "text-emerald-600 dark:text-emerald-300",
    borderClass: "border-emerald-500/40",
    softBgClass: "bg-emerald-500/10",
    cssVars: {
      "--profile-accent": "#10b981",
      "--profile-accent-soft": "rgba(16, 185, 129, 0.14)",
      "--profile-accent-text": "#34d399",
    },
  },
  amber: {
    id: "amber",
    label: "Âmbar Solar",
    swatchHex: "#f59e0b",
    ringClass: "ring-amber-500/40",
    badgeClass: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/35",
    buttonClass: "bg-amber-600 text-white hover:bg-amber-500",
    textClass: "text-amber-600 dark:text-amber-300",
    borderClass: "border-amber-500/40",
    softBgClass: "bg-amber-500/10",
    cssVars: {
      "--profile-accent": "#f59e0b",
      "--profile-accent-soft": "rgba(245, 158, 11, 0.14)",
      "--profile-accent-text": "#fbbf24",
    },
  },
  rose: {
    id: "rose",
    label: "Rosa Coral",
    swatchHex: "#f43f5e",
    ringClass: "ring-rose-500/40",
    badgeClass: "bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/35",
    buttonClass: "bg-rose-600 text-white hover:bg-rose-500",
    textClass: "text-rose-600 dark:text-rose-300",
    borderClass: "border-rose-500/40",
    softBgClass: "bg-rose-500/10",
    cssVars: {
      "--profile-accent": "#f43f5e",
      "--profile-accent-soft": "rgba(244, 63, 94, 0.14)",
      "--profile-accent-text": "#fb7185",
    },
  },
  indigo: {
    id: "indigo",
    label: "Índigo Profundo",
    swatchHex: "#6366f1",
    ringClass: "ring-indigo-500/40",
    badgeClass: "bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border-indigo-500/35",
    buttonClass: "bg-indigo-600 text-white hover:bg-indigo-500",
    textClass: "text-indigo-600 dark:text-indigo-300",
    borderClass: "border-indigo-500/40",
    softBgClass: "bg-indigo-500/10",
    cssVars: {
      "--profile-accent": "#6366f1",
      "--profile-accent-soft": "rgba(99, 102, 241, 0.14)",
      "--profile-accent-text": "#818cf8",
    },
  },
};

export const PROFILE_AVATAR_FRAMES: Record<ProfileAvatarFrame, AvatarFrameMeta> = {
  glow: {
    id: "glow",
    label: "Brilho Neon",
    wrapperClass:
      "ring-4 ring-violet-500/50 shadow-[0_0_24px_rgba(124,58,237,0.45)]",
  },
  gradient: {
    id: "gradient",
    label: "Gradiente Codit",
    wrapperClass:
      "bg-gradient-to-tr from-violet-500 via-cyan-400 to-fuchsia-500 p-1 shadow-md",
  },
  pixel: {
    id: "pixel",
    label: "Borda Pixel",
    wrapperClass:
      "ring-4 ring-amber-400/70 outline-2 outline-offset-2 outline-dashed outline-violet-400/70",
  },
  emerald: {
    id: "emerald",
    label: "Online Tech",
    wrapperClass:
      "ring-4 ring-emerald-400/60 shadow-[0_0_20px_rgba(16,185,129,0.35)]",
  },
  none: {
    id: "none",
    label: "Minimalista",
    wrapperClass: "ring-2 ring-border",
  },
};

export const OCTOPY_COMPANION_OPTIONS: Record<
  OctopyCompanionMood,
  OctopyCompanionMeta
> = {
  default: {
    id: "default",
    label: "Curioso",
    tagline: "Pronto para explorar trilhas",
  },
  coding: {
    id: "coding",
    label: "Codando",
    tagline: "Modo foco no código",
  },
  headphones: {
    id: "headphones",
    label: "No foco",
    tagline: "Lo-fi & algoritmos",
  },
  happy: {
    id: "happy",
    label: "Celebrando",
    tagline: "Comemorando conquistas",
  },
};

export const CURATED_AVATAR_PRESETS: readonly CuratedAvatarPreset[] = [
  {
    id: "default",
    label: "Octopy Clássico",
    src: "/icons/octopy-default.png",
    variant: "default",
  },
  {
    id: "coding",
    label: "Octopy Programador",
    src: "/icons/octopy-coding.png",
    variant: "coding",
  },
  {
    id: "headphones",
    label: "Octopy Fones",
    src: "/icons/octopy-headphones.png",
    variant: "headphones",
  },
  {
    id: "happy",
    label: "Octopy Feliz",
    src: "/icons/octopy-happy.png",
    variant: "happy",
  },
] as const;

export const SUGGESTED_PROFILE_SKILLS: readonly SuggestedSkillItem[] = [
  { label: "HTML/CSS", language: "html_css_js" },
  { label: "JavaScript", language: "javascript" },
  { label: "TypeScript", language: "typescript" },
  { label: "Python", language: "python" },
  { label: "React", language: "react" },
  { label: "Node.js", language: "nodejs" },
  { label: "SQL", language: "sql" },
  { label: "Java", language: "java" },
  { label: "C#", language: "csharp" },
  { label: "C++", language: "cpp" },
  { label: "Go", language: "go" },
  { label: "Rust", language: "rust" },
  { label: "PHP", language: "php" },
  { label: "Git & GitHub" },
  { label: "IA Aplicada" },
  { label: "Tailwind CSS" },
] as const;

export interface ProfileCustomizationFields {
  headline: string | null;
  location: string | null;
  website_url: string | null;
  linkedin_url: string | null;
  banner_preset: ProfileBannerPreset;
  accent_theme: ProfileAccentTheme;
  avatar_frame: ProfileAvatarFrame;
  octopy_companion: OctopyCompanionMood;
  skills: string[];
  show_email: boolean;
}

export const DEFAULT_PROFILE_CUSTOMIZATION: ProfileCustomizationFields = {
  headline: null,
  location: null,
  website_url: null,
  linkedin_url: null,
  banner_preset: "nebula",
  accent_theme: "violet",
  avatar_frame: "glow",
  octopy_companion: "coding",
  skills: [],
  show_email: false,
};

export function isAllowedAvatarPath(rawUrl: string): boolean {
  return CURATED_AVATAR_PRESETS.some((preset) => preset.src === rawUrl);
}

const SKILL_LANGUAGE_MAP: Record<string, SandboxLanguage> = {
  "html/css": "html_css_js",
  "html / css / js": "html_css_js",
  html_css_js: "html_css_js",
  html: "html",
  html5: "html",
  css: "css",
  css3: "css",
  javascript: "javascript",
  js: "javascript",
  typescript: "typescript",
  ts: "typescript",
  python: "python",
  py: "python",
  react: "react",
  "node.js": "nodejs",
  nodejs: "nodejs",
  node: "nodejs",
  java: "java",
  "c#": "csharp",
  csharp: "csharp",
  "c++": "cpp",
  cpp: "cpp",
  go: "go",
  golang: "go",
  rust: "rust",
  sql: "sql",
  postgresql: "sql",
  php: "php",
};

export function findLanguageForSkill(skill: string): SandboxLanguage | null {
  const key = skill.trim().toLowerCase();
  return SKILL_LANGUAGE_MAP[key] ?? null;
}

export function getBannerMeta(preset: string | null | undefined): BannerPresetMeta {
  if (preset && Object.prototype.hasOwnProperty.call(PROFILE_BANNERS, preset)) {
    return PROFILE_BANNERS[preset as ProfileBannerPreset];
  }
  return PROFILE_BANNERS.nebula;
}

export function getAccentThemeMeta(theme: string | null | undefined): AccentThemeMeta {
  if (theme && Object.prototype.hasOwnProperty.call(PROFILE_ACCENT_THEMES, theme)) {
    return PROFILE_ACCENT_THEMES[theme as ProfileAccentTheme];
  }
  return PROFILE_ACCENT_THEMES.violet;
}

export function getAvatarFrameMeta(frame: string | null | undefined): AvatarFrameMeta {
  if (frame && Object.prototype.hasOwnProperty.call(PROFILE_AVATAR_FRAMES, frame)) {
    return PROFILE_AVATAR_FRAMES[frame as ProfileAvatarFrame];
  }
  return PROFILE_AVATAR_FRAMES.glow;
}

export function getOctopyCompanionMeta(
  mood: string | null | undefined,
): OctopyCompanionMeta {
  if (mood && Object.prototype.hasOwnProperty.call(OCTOPY_COMPANION_OPTIONS, mood)) {
    return OCTOPY_COMPANION_OPTIONS[mood as OctopyCompanionMood];
  }
  return OCTOPY_COMPANION_OPTIONS.coding;
}
