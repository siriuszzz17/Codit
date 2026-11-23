import { z } from "zod";
import { requireSupabaseClient, type CoditSupabaseClient } from "@/lib/supabase/client";
import type {
  SandboxLanguage,
  SandboxProjectRow,
  SandboxRuntimeTarget,
  SandboxVisibility,
} from "@/lib/supabase/database.types";
import { mapSupabaseDatabaseError } from "@/lib/supabase/errors";

export const SANDBOX_LANGUAGES: readonly SandboxLanguage[] = [
  "html_css_js",
  "python",
  "javascript",
  "typescript",
];

export const SANDBOX_VISIBILITIES: readonly SandboxVisibility[] = [
  "private",
  "unlisted",
  "public_portfolio",
];

export const MAX_SANDBOX_SOURCE_LENGTH = 200_000;

function emptyStringToNull(value: unknown): unknown {
  if (typeof value === "string" && value.trim() === "") {
    return null;
  }
  return value;
}

export const createSandboxProjectSchema = z.object({
  title: z
    .string({ error: "Informe um título para o mini-projeto." })
    .trim()
    .min(1, "Informe um título para o mini-projeto.")
    .max(120, "O título pode ter no máximo 120 caracteres."),
  description: z.preprocess(
    emptyStringToNull,
    z
      .string()
      .trim()
      .max(500, "A descrição pode ter no máximo 500 caracteres.")
      .nullable()
      .optional(),
  ),
  primaryLanguage: z
    .enum(["html_css_js", "python", "javascript", "typescript"])
    .default("html_css_js"),
  sourceCode: z
    .string()
    .max(
      MAX_SANDBOX_SOURCE_LENGTH,
      "O código excede o limite permitido de 200.000 caracteres.",
    )
    .default(""),
  visibility: z
    .enum(["private", "unlisted", "public_portfolio"])
    .default("private"),
});

export const updateSandboxProjectSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "O título não pode ficar vazio.")
    .max(120, "O título pode ter no máximo 120 caracteres.")
    .optional(),
  description: z.preprocess(
    emptyStringToNull,
    z
      .string()
      .trim()
      .max(500, "A descrição pode ter no máximo 500 caracteres.")
      .nullable()
      .optional(),
  ),
  primaryLanguage: z
    .enum(["html_css_js", "python", "javascript", "typescript"])
    .optional(),
  sourceCode: z
    .string()
    .max(
      MAX_SANDBOX_SOURCE_LENGTH,
      "O código excede o limite permitido de 200.000 caracteres.",
    )
    .optional(),
  visibility: z
    .enum(["private", "unlisted", "public_portfolio"])
    .optional(),
  expectedVersion: z
    .number({ error: "Versão esperada do projeto é obrigatória." })
    .int()
    .min(1, "Versão esperada inválida."),
});

export type CreateSandboxProjectInput = z.input<
  typeof createSandboxProjectSchema
>;
export type UpdateSandboxProjectInput = z.input<
  typeof updateSandboxProjectSchema
>;

export class SandboxProjectValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SandboxProjectValidationError";
  }
}

export class SandboxProjectConflictError extends Error {
  constructor(
    message = "Este mini-projeto foi atualizado em outra aba ou dispositivo. Recarregue a versão mais recente antes de salvar novamente.",
  ) {
    super(message);
    this.name = "SandboxProjectConflictError";
  }
}

export class SandboxProjectServiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SandboxProjectServiceError";
  }
}

export function resolveDefaultRuntimeTarget(
  language: SandboxLanguage,
): SandboxRuntimeTarget {
  if (language === "python") {
    return "client_pyodide";
  }
  return "client_iframe";
}

export async function listUserSandboxProjects(
  userId: string,
  client: CoditSupabaseClient = requireSupabaseClient(),
): Promise<SandboxProjectRow[]> {
  const { data, error } = await client
    .from("sandbox_projects")
    .select("*")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .order("updated_at", { ascending: false });

  if (error) {
    throw new SandboxProjectServiceError(mapSupabaseDatabaseError(error));
  }

  return data ?? [];
}

export async function getUserSandboxProjectById(
  userId: string,
  projectId: string,
  client: CoditSupabaseClient = requireSupabaseClient(),
): Promise<SandboxProjectRow | null> {
  const { data, error } = await client
    .from("sandbox_projects")
    .select("*")
    .eq("id", projectId)
    .eq("user_id", userId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) {
    throw new SandboxProjectServiceError(mapSupabaseDatabaseError(error));
  }

  return data;
}

export async function createSandboxProject(
  userId: string,
  input: CreateSandboxProjectInput,
  client: CoditSupabaseClient = requireSupabaseClient(),
): Promise<SandboxProjectRow> {
  const parsed = createSandboxProjectSchema.safeParse(input);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    throw new SandboxProjectValidationError(
      firstIssue?.message ?? "Dados inválidos para criar o mini-projeto.",
    );
  }

  const runtimeTarget = resolveDefaultRuntimeTarget(
    parsed.data.primaryLanguage,
  );

  const { data, error } = await client
    .from("sandbox_projects")
    .insert({
      user_id: userId,
      title: parsed.data.title,
      description: parsed.data.description ?? null,
      primary_language: parsed.data.primaryLanguage,
      runtime_target: runtimeTarget,
      source_code: parsed.data.sourceCode,
      visibility: parsed.data.visibility,
      version: 1,
    })
    .select("*")
    .single();

  if (error) {
    throw new SandboxProjectServiceError(mapSupabaseDatabaseError(error));
  }

  return data;
}

export async function updateSandboxProject(
  userId: string,
  projectId: string,
  input: UpdateSandboxProjectInput,
  client: CoditSupabaseClient = requireSupabaseClient(),
): Promise<SandboxProjectRow> {
  const parsed = updateSandboxProjectSchema.safeParse(input);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    throw new SandboxProjectValidationError(
      firstIssue?.message ?? "Dados inválidos para atualizar o mini-projeto.",
    );
  }

  const nextLanguage = parsed.data.primaryLanguage;
  const updatePayload = {
    ...(parsed.data.title !== undefined ? { title: parsed.data.title } : {}),
    ...(parsed.data.description !== undefined
      ? { description: parsed.data.description }
      : {}),
    ...(nextLanguage !== undefined
      ? {
          primary_language: nextLanguage,
          runtime_target: resolveDefaultRuntimeTarget(nextLanguage),
        }
      : {}),
    ...(parsed.data.sourceCode !== undefined
      ? { source_code: parsed.data.sourceCode }
      : {}),
    ...(parsed.data.visibility !== undefined
      ? { visibility: parsed.data.visibility }
      : {}),
    version: parsed.data.expectedVersion + 1,
  };

  const { data, error } = await client
    .from("sandbox_projects")
    .update(updatePayload)
    .eq("id", projectId)
    .eq("user_id", userId)
    .eq("version", parsed.data.expectedVersion)
    .is("deleted_at", null)
    .select("*")
    .maybeSingle();

  if (error) {
    throw new SandboxProjectServiceError(mapSupabaseDatabaseError(error));
  }

  if (!data) {
    throw new SandboxProjectConflictError();
  }

  return data;
}

export async function softDeleteSandboxProject(
  userId: string,
  projectId: string,
  client: CoditSupabaseClient = requireSupabaseClient(),
): Promise<boolean> {
  const { data, error } = await client
    .from("sandbox_projects")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", projectId)
    .eq("user_id", userId)
    .is("deleted_at", null)
    .select("id")
    .maybeSingle();

  if (error) {
    throw new SandboxProjectServiceError(mapSupabaseDatabaseError(error));
  }

  return data !== null;
}
