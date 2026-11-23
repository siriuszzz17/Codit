import type { User } from "@supabase/supabase-js";
import { z } from "zod";
import {
  requireSupabaseClient,
  type CoditSupabaseClient,
} from "@/lib/supabase/client";
import type { ProfileRow } from "@/lib/supabase/database.types";
import {
  isSchemaMismatchError,
  mapSupabaseDatabaseError,
} from "@/lib/supabase/errors";
import {
  DEFAULT_PROFILE_CUSTOMIZATION,
  isAllowedAvatarPath,
  OCTOPY_COMPANION_IDS,
  PROFILE_ACCENT_IDS,
  PROFILE_AVATAR_FRAME_IDS,
  PROFILE_BANNER_IDS,
  type ProfileCustomizationFields,
} from "@/modules/profiles/profile-themes";
import { coditUsernameSchema } from "@/modules/social/social-schemas";

const GITHUB_USERNAME_REGEX = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/;
const PROFILE_PREFS_STORAGE_PREFIX = "codit:profile-prefs:";

function emptyStringToNull(value: unknown): unknown {
  if (typeof value === "string" && value.trim() === "") {
    return null;
  }
  return value;
}

function isSafeHttpUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

function isAllowedAvatarValue(rawUrl: string): boolean {
  return isSafeHttpUrl(rawUrl) || isAllowedAvatarPath(rawUrl);
}

function normalizeSkillsList(rawSkills: readonly string[]): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const item of rawSkills) {
    const cleaned = item.trim();
    if (!cleaned || cleaned.length > 32) {
      continue;
    }
    const key = cleaned.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    normalized.push(cleaned);
    if (normalized.length >= 12) {
      break;
    }
  }

  return normalized;
}

export const updateProfileSchema = z.object({
  fullName: z
    .string({ error: "Informe seu nome." })
    .trim()
    .min(2, "O nome deve ter pelo menos 2 caracteres.")
    .max(120, "O nome pode ter no máximo 120 caracteres."),
  username: z.preprocess(
    emptyStringToNull,
    coditUsernameSchema.nullable().optional(),
  ),
  bio: z.preprocess(
    emptyStringToNull,
    z
      .string()
      .trim()
      .max(500, "A bio pode ter no máximo 500 caracteres.")
      .nullable()
      .optional(),
  ),
  githubUsername: z.preprocess(
    emptyStringToNull,
    z
      .string()
      .trim()
      .refine(
        (value) => GITHUB_USERNAME_REGEX.test(value),
        "Usuário do GitHub inválido (use letras, números ou hífens, sem @).",
      )
      .nullable()
      .optional(),
  ),
  avatarUrl: z.preprocess(
    emptyStringToNull,
    z
      .string()
      .trim()
      .refine(
        isAllowedAvatarValue,
        "O avatar deve usar uma URL http(s):// ou um ícone oficial do Octopy.",
      )
      .nullable()
      .optional(),
  ),
  headline: z.preprocess(
    emptyStringToNull,
    z
      .string()
      .trim()
      .max(120, "O título profissional pode ter no máximo 120 caracteres.")
      .nullable()
      .optional(),
  ),
  location: z.preprocess(
    emptyStringToNull,
    z
      .string()
      .trim()
      .max(80, "A localização pode ter no máximo 80 caracteres.")
      .nullable()
      .optional(),
  ),
  websiteUrl: z.preprocess(
    emptyStringToNull,
    z
      .string()
      .trim()
      .max(300, "A URL do site pode ter no máximo 300 caracteres.")
      .refine(
        isSafeHttpUrl,
        "A URL do site deve começar com http:// ou https://.",
      )
      .nullable()
      .optional(),
  ),
  linkedinUrl: z.preprocess(
    emptyStringToNull,
    z
      .string()
      .trim()
      .max(300, "A URL do LinkedIn pode ter no máximo 300 caracteres.")
      .refine(
        isSafeHttpUrl,
        "A URL do LinkedIn deve começar com http:// ou https://.",
      )
      .nullable()
      .optional(),
  ),
  bannerPreset: z.enum(PROFILE_BANNER_IDS).optional(),
  accentTheme: z.enum(PROFILE_ACCENT_IDS).optional(),
  avatarFrame: z.enum(PROFILE_AVATAR_FRAME_IDS).optional(),
  octopyCompanion: z.enum(OCTOPY_COMPANION_IDS).optional(),
  skills: z
    .array(
      z
        .string()
        .trim()
        .min(1, "Habilidade não pode ficar vazia.")
        .max(32, "Cada habilidade pode ter no máximo 32 caracteres."),
    )
    .max(12, "Selecione no máximo 12 habilidades.")
    .transform(normalizeSkillsList)
    .optional(),
  showEmail: z.boolean().optional(),
});

export type UpdateProfileInput = z.input<typeof updateProfileSchema>;

export class ProfileValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProfileValidationError";
  }
}

export class ProfileServiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProfileServiceError";
  }
}

type RawProfileDbRow = Pick<
  ProfileRow,
  | "id"
  | "email"
  | "full_name"
  | "avatar_url"
  | "role"
  | "bio"
  | "github_username"
  | "created_at"
  | "updated_at"
> &
  Partial<Pick<ProfileRow, "username">> &
  Partial<ProfileCustomizationFields>;

function readLocalProfilePrefs(
  userId: string,
): Partial<ProfileCustomizationFields> | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(
      `${PROFILE_PREFS_STORAGE_PREFIX}${userId}`,
    );
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as unknown;
    return typeof parsed === "object" && parsed !== null
      ? (parsed as Partial<ProfileCustomizationFields>)
      : null;
  } catch {
    return null;
  }
}

function writeLocalProfilePrefs(
  userId: string,
  prefs: Partial<ProfileCustomizationFields>,
): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(
      `${PROFILE_PREFS_STORAGE_PREFIX}${userId}`,
      JSON.stringify(prefs),
    );
  } catch {
    // Ignora falha de cota ou modo privado
  }
}

function readMetadataProfilePrefs(
  user: Pick<User, "user_metadata">,
): Partial<ProfileCustomizationFields> | null {
  const metadata = user.user_metadata;
  if (!metadata || typeof metadata !== "object") {
    return null;
  }
  const candidate = (metadata as Record<string, unknown>).codit_profile_prefs;
  if (!candidate || typeof candidate !== "object") {
    return null;
  }
  return candidate as Partial<ProfileCustomizationFields>;
}

export function normalizeProfileRow(
  raw: RawProfileDbRow,
  fallbackPrefs?: Partial<ProfileCustomizationFields> | null,
): ProfileRow {
  const hasExtendedSchema = raw.banner_preset !== undefined;
  const fallback = hasExtendedSchema ? null : fallbackPrefs;

  return {
    id: raw.id,
    email: raw.email,
    full_name: raw.full_name,
    username: typeof raw.username === "string" ? raw.username : "",
    avatar_url: raw.avatar_url,
    role: raw.role,
    bio: raw.bio,
    github_username: raw.github_username,
    headline:
      raw.headline !== undefined
        ? raw.headline
        : (fallback?.headline ?? DEFAULT_PROFILE_CUSTOMIZATION.headline),
    location:
      raw.location !== undefined
        ? raw.location
        : (fallback?.location ?? DEFAULT_PROFILE_CUSTOMIZATION.location),
    website_url:
      raw.website_url !== undefined
        ? raw.website_url
        : (fallback?.website_url ?? DEFAULT_PROFILE_CUSTOMIZATION.website_url),
    linkedin_url:
      raw.linkedin_url !== undefined
        ? raw.linkedin_url
        : (fallback?.linkedin_url ??
          DEFAULT_PROFILE_CUSTOMIZATION.linkedin_url),
    banner_preset:
      raw.banner_preset ??
      fallback?.banner_preset ??
      DEFAULT_PROFILE_CUSTOMIZATION.banner_preset,
    accent_theme:
      raw.accent_theme ??
      fallback?.accent_theme ??
      DEFAULT_PROFILE_CUSTOMIZATION.accent_theme,
    avatar_frame:
      raw.avatar_frame ??
      fallback?.avatar_frame ??
      DEFAULT_PROFILE_CUSTOMIZATION.avatar_frame,
    octopy_companion:
      raw.octopy_companion ??
      fallback?.octopy_companion ??
      DEFAULT_PROFILE_CUSTOMIZATION.octopy_companion,
    skills: Array.isArray(raw.skills)
      ? raw.skills
      : Array.isArray(fallback?.skills)
        ? fallback.skills
        : DEFAULT_PROFILE_CUSTOMIZATION.skills,
    show_email:
      raw.show_email !== undefined
        ? raw.show_email
        : (fallback?.show_email ?? DEFAULT_PROFILE_CUSTOMIZATION.show_email),
    created_at: raw.created_at,
    updated_at: raw.updated_at,
  };
}

function deriveFullName(user: Pick<User, "email" | "user_metadata">): string {
  const metadata = user.user_metadata ?? {};
  const rawName =
    typeof metadata.full_name === "string"
      ? metadata.full_name
      : typeof metadata.name === "string"
        ? metadata.name
        : "";
  const cleaned = rawName.trim();
  if (cleaned.length >= 2) {
    return cleaned.slice(0, 120);
  }

  const emailLocal = (user.email ?? "").split("@")[0]?.trim() ?? "";
  if (emailLocal.length >= 2) {
    return emailLocal.slice(0, 120);
  }

  return "Estudante Codit";
}

function deriveAvatarUrl(user: Pick<User, "user_metadata">): string | null {
  const metadata = user.user_metadata ?? {};
  const candidate =
    typeof metadata.avatar_url === "string"
      ? metadata.avatar_url
      : typeof metadata.picture === "string"
        ? metadata.picture
        : "";
  const trimmed = candidate.trim();
  return trimmed && isAllowedAvatarValue(trimmed) ? trimmed : null;
}

function deriveOptionalUsername(
  user: Pick<User, "user_metadata">,
): string | undefined {
  const rawUsername = user.user_metadata?.username;
  if (typeof rawUsername !== "string" || rawUsername.trim() === "") {
    return undefined;
  }

  const parsed = coditUsernameSchema.safeParse(rawUsername);
  return parsed.success ? parsed.data : undefined;
}

export async function getProfileByUserId(
  userId: string,
  client: CoditSupabaseClient = requireSupabaseClient(),
  extraFallbackPrefs?: Partial<ProfileCustomizationFields> | null,
): Promise<ProfileRow | null> {
  const { data, error } = await client
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    throw new ProfileServiceError(mapSupabaseDatabaseError(error));
  }

  if (!data) {
    return null;
  }

  const rawRow = data as RawProfileDbRow;
  const mergedFallback = {
    ...(extraFallbackPrefs ?? {}),
    ...(readLocalProfilePrefs(userId) ?? {}),
  };

  return normalizeProfileRow(rawRow, mergedFallback);
}

export async function ensureProfile(
  user: Pick<User, "id" | "email" | "user_metadata">,
  client: CoditSupabaseClient = requireSupabaseClient(),
): Promise<ProfileRow> {
  const metadataPrefs = readMetadataProfilePrefs(user);
  const localPrefs = readLocalProfilePrefs(user.id);
  const fallbackPrefs = {
    ...(metadataPrefs ?? {}),
    ...(localPrefs ?? {}),
  };

  if (metadataPrefs && !localPrefs) {
    writeLocalProfilePrefs(user.id, fallbackPrefs);
  }

  const existing = await getProfileByUserId(user.id, client, metadataPrefs);
  if (existing) {
    return existing;
  }

  const normalizedEmail = (user.email ?? "").trim().toLowerCase();
  if (!normalizedEmail) {
    throw new ProfileServiceError(
      "Não foi possível inicializar o perfil sem um e-mail associado à conta.",
    );
  }

  const optionalUsername = deriveOptionalUsername(user);
  const baseInsert = {
    id: user.id,
    email: normalizedEmail,
    full_name: deriveFullName(user),
    avatar_url: deriveAvatarUrl(user),
    role: "student" as const,
  };

  const { data, error } = await client
    .from("profiles")
    .upsert(
      {
        ...baseInsert,
        ...(optionalUsername ? { username: optionalUsername } : {}),
      },
      { onConflict: "id" },
    )
    .select("*")
    .single();

  if (!error) {
    return normalizeProfileRow(data as RawProfileDbRow, fallbackPrefs);
  }

  if (optionalUsername && isSchemaMismatchError(error)) {
    const fallbackInsert = await client
      .from("profiles")
      .upsert(baseInsert, { onConflict: "id" })
      .select("*")
      .single();

    if (!fallbackInsert.error) {
      return normalizeProfileRow(
        fallbackInsert.data as RawProfileDbRow,
        fallbackPrefs,
      );
    }

    throw new ProfileServiceError(
      mapSupabaseDatabaseError(fallbackInsert.error),
    );
  }

  throw new ProfileServiceError(mapSupabaseDatabaseError(error));
}

export async function updateProfile(
  userId: string,
  input: UpdateProfileInput,
  client: CoditSupabaseClient = requireSupabaseClient(),
): Promise<ProfileRow> {
  const parsed = updateProfileSchema.safeParse(input);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    throw new ProfileValidationError(
      firstIssue?.message ?? "Dados inválidos para atualizar o perfil.",
    );
  }

  const corePayload = {
    full_name: parsed.data.fullName,
    ...(parsed.data.username !== undefined && parsed.data.username !== null
      ? { username: parsed.data.username }
      : {}),
    ...(parsed.data.bio !== undefined ? { bio: parsed.data.bio } : {}),
    ...(parsed.data.githubUsername !== undefined
      ? { github_username: parsed.data.githubUsername }
      : {}),
    ...(parsed.data.avatarUrl !== undefined
      ? { avatar_url: parsed.data.avatarUrl }
      : {}),
  };

  const extendedPayload: Partial<ProfileCustomizationFields> = {
    ...(parsed.data.headline !== undefined
      ? { headline: parsed.data.headline }
      : {}),
    ...(parsed.data.location !== undefined
      ? { location: parsed.data.location }
      : {}),
    ...(parsed.data.websiteUrl !== undefined
      ? { website_url: parsed.data.websiteUrl }
      : {}),
    ...(parsed.data.linkedinUrl !== undefined
      ? { linkedin_url: parsed.data.linkedinUrl }
      : {}),
    ...(parsed.data.bannerPreset !== undefined
      ? { banner_preset: parsed.data.bannerPreset }
      : {}),
    ...(parsed.data.accentTheme !== undefined
      ? { accent_theme: parsed.data.accentTheme }
      : {}),
    ...(parsed.data.avatarFrame !== undefined
      ? { avatar_frame: parsed.data.avatarFrame }
      : {}),
    ...(parsed.data.octopyCompanion !== undefined
      ? { octopy_companion: parsed.data.octopyCompanion }
      : {}),
    ...(parsed.data.skills !== undefined ? { skills: parsed.data.skills } : {}),
    ...(parsed.data.showEmail !== undefined
      ? { show_email: parsed.data.showEmail }
      : {}),
  };

  const fullPayload = {
    ...corePayload,
    ...extendedPayload,
  };

  const { data, error } = await client
    .from("profiles")
    .update(fullPayload)
    .eq("id", userId)
    .select("*")
    .single();

  if (!error) {
    return normalizeProfileRow(data as RawProfileDbRow);
  }

  if (!isSchemaMismatchError(error)) {
    throw new ProfileServiceError(mapSupabaseDatabaseError(error));
  }

  // Fallback resiliente para banco Fase 2 ainda sem as colunas da Fase 3 / Fase 4
  let fallbackResult = await client
    .from("profiles")
    .update(corePayload)
    .eq("id", userId)
    .select("*")
    .single();

  if (
    fallbackResult.error &&
    "username" in corePayload &&
    isSchemaMismatchError(fallbackResult.error)
  ) {
    const { username: _omittedUsername, ...coreWithoutUsername } = corePayload;
    void _omittedUsername;
    fallbackResult = await client
      .from("profiles")
      .update(coreWithoutUsername)
      .eq("id", userId)
      .select("*")
      .single();
  }

  if (fallbackResult.error) {
    throw new ProfileServiceError(
      mapSupabaseDatabaseError(fallbackResult.error),
    );
  }

  const mergedPrefs: Partial<ProfileCustomizationFields> = {
    ...readLocalProfilePrefs(userId),
    ...extendedPayload,
  };
  writeLocalProfilePrefs(userId, mergedPrefs);

  try {
    if (typeof client.auth?.updateUser === "function") {
      await client.auth.updateUser({
        data: {
          codit_profile_prefs: mergedPrefs,
        },
      });
    }
  } catch {
    // Não falha salvamento local se atualização de metadata estiver indisponível
  }

  return normalizeProfileRow(
    fallbackResult.data as RawProfileDbRow,
    mergedPrefs,
  );
}
