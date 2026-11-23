import type { User } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseClient, type CoditSupabaseClient } from "@/lib/supabase/client";
import type { ProfileRow } from "@/lib/supabase/database.types";
import { mapSupabaseDatabaseError } from "@/lib/supabase/errors";

const GITHUB_USERNAME_REGEX = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/;

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

export const updateProfileSchema = z.object({
  fullName: z
    .string({ error: "Informe seu nome." })
    .trim()
    .min(2, "O nome deve ter pelo menos 2 caracteres.")
    .max(120, "O nome pode ter no máximo 120 caracteres."),
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
        isSafeHttpUrl,
        "A URL do avatar deve usar protocolo http:// ou https://.",
      )
      .nullable()
      .optional(),
  ),
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
  return trimmed && isSafeHttpUrl(trimmed) ? trimmed : null;
}

export async function getProfileByUserId(
  userId: string,
  client: CoditSupabaseClient = requireSupabaseClient(),
): Promise<ProfileRow | null> {
  const { data, error } = await client
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    throw new ProfileServiceError(mapSupabaseDatabaseError(error));
  }

  return data;
}

export async function ensureProfile(
  user: Pick<User, "id" | "email" | "user_metadata">,
  client: CoditSupabaseClient = requireSupabaseClient(),
): Promise<ProfileRow> {
  const existing = await getProfileByUserId(user.id, client);
  if (existing) {
    return existing;
  }

  const normalizedEmail = (user.email ?? "").trim().toLowerCase();
  if (!normalizedEmail) {
    throw new ProfileServiceError(
      "Não foi possível inicializar o perfil sem um e-mail associado à conta.",
    );
  }

  const { data, error } = await client
    .from("profiles")
    .upsert(
      {
        id: user.id,
        email: normalizedEmail,
        full_name: deriveFullName(user),
        avatar_url: deriveAvatarUrl(user),
        role: "student",
      },
      { onConflict: "id" },
    )
    .select("*")
    .single();

  if (error) {
    throw new ProfileServiceError(mapSupabaseDatabaseError(error));
  }

  return data;
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

  const payload = {
    full_name: parsed.data.fullName,
    ...(parsed.data.bio !== undefined ? { bio: parsed.data.bio } : {}),
    ...(parsed.data.githubUsername !== undefined
      ? { github_username: parsed.data.githubUsername }
      : {}),
    ...(parsed.data.avatarUrl !== undefined
      ? { avatar_url: parsed.data.avatarUrl }
      : {}),
  };

  const { data, error } = await client
    .from("profiles")
    .update(payload)
    .eq("id", userId)
    .select("*")
    .single();

  if (error) {
    throw new ProfileServiceError(mapSupabaseDatabaseError(error));
  }

  return data;
}
