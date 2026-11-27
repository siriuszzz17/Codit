import { z } from "zod";
import {
  createProblemDetails,
  type ProblemDetails,
} from "@/lib/problem-details";
import {
  requireSupabaseClient,
  type CoditSupabaseClient,
} from "@/lib/supabase/client";
import type {
  SandboxLanguage,
  SandboxProjectFilesJson,
  SandboxProjectRow,
  SandboxProjectVersionRow,
  SandboxRuntimeTarget,
  SandboxVisibility,
} from "@/lib/supabase/database.types";
import {
  extractSupabaseErrorMeta,
  isMissingDatabaseSchemaError,
  isSchemaMismatchError,
  isTablePrivilegeError,
  mapSupabaseDatabaseError,
} from "@/lib/supabase/errors";
import { assertAuthenticatedUserMatches } from "@/lib/supabase/session-guard";
import {
  getLanguageMeta,
  ORDERED_SANDBOX_LANGUAGES,
  toLegacySandboxLanguage,
} from "@/modules/sandbox/language-catalog";

export const SANDBOX_LANGUAGES: readonly SandboxLanguage[] =
  ORDERED_SANDBOX_LANGUAGES;

export const SANDBOX_VISIBILITIES: readonly SandboxVisibility[] = [
  "private",
  "friends",
  "unlisted",
  "public_portfolio",
];

export const MAX_SANDBOX_SOURCE_LENGTH = 200_000;
const PROJECT_META_STORAGE_PREFIX = "codit:project-meta:";

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

function normalizeTagsList(rawTags: readonly string[]): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const raw of rawTags) {
    const cleaned = raw.replace(/^#+/, "").trim();
    if (!cleaned || cleaned.length > 24) {
      continue;
    }
    const key = cleaned.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    normalized.push(cleaned);
    if (normalized.length >= 6) {
      break;
    }
  }

  return normalized;
}

const sandboxLanguageEnum = z.enum([
  "html_css_js",
  "html",
  "css",
  "javascript",
  "typescript",
  "python",
  "react",
  "nodejs",
  "java",
  "csharp",
  "cpp",
  "go",
  "rust",
  "sql",
  "php",
]);

const optionalTagsSchema = z
  .array(
    z
      .string()
      .trim()
      .min(1, "Tag não pode ficar vazia.")
      .max(24, "Cada tag pode ter no máximo 24 caracteres."),
  )
  .max(6, "Adicione no máximo 6 tags por projeto.")
  .transform(normalizeTagsList)
  .optional();

const sandboxFilesSchema = z
  .object({
    "index.html": z
      .string()
      .max(MAX_SANDBOX_SOURCE_LENGTH, "O arquivo index.html excede o limite permitido.")
      .optional(),
    "styles.css": z
      .string()
      .max(MAX_SANDBOX_SOURCE_LENGTH, "O arquivo styles.css excede o limite permitido.")
      .optional(),
    "script.js": z
      .string()
      .max(MAX_SANDBOX_SOURCE_LENGTH, "O arquivo script.js excede o limite permitido.")
      .optional(),
  })
  .nullable()
  .optional();

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
  primaryLanguage: sandboxLanguageEnum.default("html_css_js"),
  sourceCode: z
    .string()
    .max(
      MAX_SANDBOX_SOURCE_LENGTH,
      "O código excede o limite permitido de 200.000 caracteres.",
    )
    .default(""),
  files: sandboxFilesSchema,
  visibility: z
    .enum(["private", "friends", "unlisted", "public_portfolio"])
    .default("private"),
  isPinned: z.boolean().optional(),
  tags: optionalTagsSchema,
  repositoryUrl: z.preprocess(
    emptyStringToNull,
    z
      .string()
      .trim()
      .max(300, "A URL do repositório pode ter no máximo 300 caracteres.")
      .refine(
        isSafeHttpUrl,
        "A URL do repositório deve começar com http:// ou https://.",
      )
      .nullable()
      .optional(),
  ),
  liveUrl: z.preprocess(
    emptyStringToNull,
    z
      .string()
      .trim()
      .max(300, "A URL da demonstração pode ter no máximo 300 caracteres.")
      .refine(
        isSafeHttpUrl,
        "A URL da demonstração deve começar com http:// ou https://.",
      )
      .nullable()
      .optional(),
  ),
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
  primaryLanguage: sandboxLanguageEnum.optional(),
  sourceCode: z
    .string()
    .max(
      MAX_SANDBOX_SOURCE_LENGTH,
      "O código excede o limite permitido de 200.000 caracteres.",
    )
    .optional(),
  files: sandboxFilesSchema,
  visibility: z
    .enum(["private", "friends", "unlisted", "public_portfolio"])
    .optional(),
  isPinned: z.boolean().optional(),
  tags: optionalTagsSchema,
  repositoryUrl: z.preprocess(
    emptyStringToNull,
    z
      .string()
      .trim()
      .max(300, "A URL do repositório pode ter no máximo 300 caracteres.")
      .refine(
        isSafeHttpUrl,
        "A URL do repositório deve começar com http:// ou https://.",
      )
      .nullable()
      .optional(),
  ),
  liveUrl: z.preprocess(
    emptyStringToNull,
    z
      .string()
      .trim()
      .max(300, "A URL da demonstração pode ter no máximo 300 caracteres.")
      .refine(
        isSafeHttpUrl,
        "A URL da demonstração deve começar com http:// ou https://.",
      )
      .nullable()
      .optional(),
  ),
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

export interface SandboxProjectServiceErrorDetails {
  code?: string | undefined;
  status?: number | null | undefined;
  isPermissionGrantMissing?: boolean | undefined;
  isMigrationMissing?: boolean | undefined;
}

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
  readonly code?: string | undefined;
  readonly status?: number | null | undefined;
  readonly isPermissionGrantMissing: boolean;
  readonly isMigrationMissing: boolean;

  constructor(message: string, details?: SandboxProjectServiceErrorDetails) {
    super(message);
    this.name = "SandboxProjectServiceError";
    this.code = details?.code;
    this.status = details?.status ?? null;
    this.isPermissionGrantMissing = Boolean(details?.isPermissionGrantMissing);
    this.isMigrationMissing = Boolean(details?.isMigrationMissing);
  }
}

function toSandboxServiceError(
  error: unknown,
  status: number | null,
  operation: string,
): SandboxProjectServiceError {
  const meta = extractSupabaseErrorMeta(error, { status });
  return new SandboxProjectServiceError(
    mapSupabaseDatabaseError(error, {
      status: meta.status,
      table: "sandbox_projects",
      operation,
    }),
    {
      code: meta.code || undefined,
      status: meta.status,
      isPermissionGrantMissing: isTablePrivilegeError(error),
      isMigrationMissing: isMissingDatabaseSchemaError(error),
    },
  );
}

interface ProjectFallbackMeta {
  primary_language?: SandboxLanguage;
  runtime_target?: SandboxRuntimeTarget;
  is_pinned?: boolean;
  tags?: string[];
  repository_url?: string | null;
  live_url?: string | null;
}

type ProjectFallbackMap = Record<string, ProjectFallbackMeta>;

type RawSandboxProjectDbRow = Pick<
  SandboxProjectRow,
  | "id"
  | "user_id"
  | "title"
  | "description"
  | "primary_language"
  | "runtime_target"
  | "source_code"
  | "visibility"
  | "share_slug"
  | "version"
  | "created_at"
  | "updated_at"
  | "deleted_at"
> &
  Partial<
    Pick<
      SandboxProjectRow,
      "files" | "is_pinned" | "tags" | "repository_url" | "live_url"
    >
  >;

function readProjectFallbackMap(userId: string): ProjectFallbackMap {
  if (typeof window === "undefined") {
    return {};
  }

  try {
    const raw = window.localStorage.getItem(
      `${PROJECT_META_STORAGE_PREFIX}${userId}`,
    );
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw) as unknown;
    return typeof parsed === "object" && parsed !== null
      ? (parsed as ProjectFallbackMap)
      : {};
  } catch {
    return {};
  }
}

function writeProjectFallbackMap(
  userId: string,
  map: ProjectFallbackMap,
): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(
      `${PROJECT_META_STORAGE_PREFIX}${userId}`,
      JSON.stringify(map),
    );
  } catch {
    // Ignora falha de cota ou modo privado
  }
}

async function syncProjectFallbackEntry(
  userId: string,
  projectId: string,
  entry: ProjectFallbackMeta | null,
  client: CoditSupabaseClient,
): Promise<ProjectFallbackMeta | null> {
  const currentMap = readProjectFallbackMap(userId);
  const nextMap: ProjectFallbackMap = { ...currentMap };

  if (entry === null) {
    delete nextMap[projectId];
  } else {
    nextMap[projectId] = {
      ...currentMap[projectId],
      ...entry,
    };
  }

  writeProjectFallbackMap(userId, nextMap);

  try {
    if (typeof client.auth?.updateUser === "function") {
      await client.auth.updateUser({
        data: {
          codit_project_meta: nextMap,
        },
      });
    }
  } catch {
    // Mantém fallback local mesmo se auth metadata não aceitar atualização
  }

  return nextMap[projectId] ?? null;
}

export function normalizeSandboxProjectRow(
  raw: RawSandboxProjectDbRow,
  fallbackMeta?: ProjectFallbackMeta | null,
): SandboxProjectRow {
  const hasExtendedColumns = raw.is_pinned !== undefined;
  const resolvedLanguage =
    !hasExtendedColumns && fallbackMeta?.primary_language
      ? fallbackMeta.primary_language
      : raw.primary_language;
  const resolvedRuntime =
    !hasExtendedColumns && fallbackMeta?.runtime_target
      ? fallbackMeta.runtime_target
      : raw.runtime_target;

  return {
    id: raw.id,
    user_id: raw.user_id,
    title: raw.title,
    description: raw.description,
    primary_language: resolvedLanguage,
    runtime_target: resolvedRuntime,
    source_code: raw.source_code,
    ...(raw.files !== undefined ? { files: raw.files } : {}),
    visibility: raw.visibility,
    share_slug: raw.share_slug,
    is_pinned:
      raw.is_pinned !== undefined
        ? raw.is_pinned
        : (fallbackMeta?.is_pinned ?? false),
    tags: Array.isArray(raw.tags)
      ? raw.tags
      : Array.isArray(fallbackMeta?.tags)
        ? fallbackMeta.tags
        : [],
    repository_url:
      raw.repository_url !== undefined
        ? raw.repository_url
        : (fallbackMeta?.repository_url ?? null),
    live_url:
      raw.live_url !== undefined
        ? raw.live_url
        : (fallbackMeta?.live_url ?? null),
    version: raw.version,
    created_at: raw.created_at,
    updated_at: raw.updated_at,
    deleted_at: raw.deleted_at,
  };
}

export function resolveDefaultRuntimeTarget(
  language: SandboxLanguage,
): SandboxRuntimeTarget {
  return getLanguageMeta(language).defaultRuntimeTarget;
}

export async function listUserSandboxProjects(
  userId: string,
  client: CoditSupabaseClient = requireSupabaseClient(),
): Promise<SandboxProjectRow[]> {
  const { data, error, status } = await client
    .from("sandbox_projects")
    .select("*")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .order("updated_at", { ascending: false });

  if (error) {
    throw toSandboxServiceError(error, status, "listUserSandboxProjects");
  }

  let fallbackMap = readProjectFallbackMap(userId);
  const rows = (data ?? []) as RawSandboxProjectDbRow[];

  if (
    Object.keys(fallbackMap).length === 0 &&
    rows.some((row) => row.is_pinned === undefined) &&
    typeof client.auth?.getUser === "function"
  ) {
    try {
      const authUserResult = await client.auth.getUser();
      const metadataMap = authUserResult.data.user?.user_metadata
        ?.codit_project_meta as unknown;
      if (metadataMap && typeof metadataMap === "object") {
        fallbackMap = metadataMap as ProjectFallbackMap;
        writeProjectFallbackMap(userId, fallbackMap);
      }
    } catch {
      // Ignora indisponibilidade de metadata
    }
  }

  return rows
    .map((row) => normalizeSandboxProjectRow(row, fallbackMap[row.id]))
    .sort((a, b) => {
      if (a.is_pinned !== b.is_pinned) {
        return a.is_pinned ? -1 : 1;
      }
      return Date.parse(b.updated_at) - Date.parse(a.updated_at);
    });
}

export async function getUserSandboxProjectById(
  userId: string,
  projectId: string,
  client: CoditSupabaseClient = requireSupabaseClient(),
): Promise<SandboxProjectRow | null> {
  const { data, error, status } = await client
    .from("sandbox_projects")
    .select("*")
    .eq("id", projectId)
    .eq("user_id", userId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) {
    throw toSandboxServiceError(error, status, "getUserSandboxProjectById");
  }

  if (!data) {
    return null;
  }

  const fallbackMap = readProjectFallbackMap(userId);
  return normalizeSandboxProjectRow(
    data as RawSandboxProjectDbRow,
    fallbackMap[projectId],
  );
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

  await assertAuthenticatedUserMatches(
    userId,
    client,
    (message) =>
      new SandboxProjectServiceError(message, {
        code: "AUTH_USER_MISMATCH",
        status: 403,
      }),
  );

  const runtimeTarget = resolveDefaultRuntimeTarget(
    parsed.data.primaryLanguage,
  );

  const corePayload = {
    user_id: userId,
    title: parsed.data.title,
    description: parsed.data.description ?? null,
    primary_language: parsed.data.primaryLanguage,
    runtime_target: runtimeTarget,
    source_code: parsed.data.sourceCode,
    visibility: parsed.data.visibility,
    version: 1,
  };

  const extendedPayload = {
    ...(parsed.data.files !== undefined ? { files: parsed.data.files } : {}),
    ...(parsed.data.isPinned !== undefined
      ? { is_pinned: parsed.data.isPinned }
      : {}),
    ...(parsed.data.tags !== undefined ? { tags: parsed.data.tags } : {}),
    ...(parsed.data.repositoryUrl !== undefined
      ? { repository_url: parsed.data.repositoryUrl }
      : {}),
    ...(parsed.data.liveUrl !== undefined
      ? { live_url: parsed.data.liveUrl }
      : {}),
  };

  const { data, error, status } = await client
    .from("sandbox_projects")
    .insert({
      ...corePayload,
      ...extendedPayload,
    })
    .select("*")
    .single();

  if (!error) {
    return normalizeSandboxProjectRow(data as RawSandboxProjectDbRow);
  }

  if (!isSchemaMismatchError(error)) {
    throw toSandboxServiceError(error, status, "createSandboxProject");
  }

  // Fallback resiliente quando o banco remoto ainda está na migração Fase 2.
  // Inclui os campos legados `language` e `code` (NOT NULL em instâncias não
  // migradas) para evitar o erro 23502 de violação de NOT NULL.
  const legacyLanguage = toLegacySandboxLanguage(parsed.data.primaryLanguage);
  const legacyRuntime = resolveDefaultRuntimeTarget(legacyLanguage);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const legacyPayload: any = {
    ...corePayload,
    primary_language: legacyLanguage,
    runtime_target: legacyRuntime,
    // Colunas legadas NOT NULL sem default em schemas pré-Fase3
    language: legacyLanguage,
    code: corePayload.source_code ?? "",
  };

  const fallbackInsert = await client
    .from("sandbox_projects")
    .insert(legacyPayload)
    .select("*")
    .single();

  if (fallbackInsert.error) {
    throw toSandboxServiceError(
      fallbackInsert.error,
      fallbackInsert.status,
      "createSandboxProject.fallback",
    );
  }

  const createdRow = fallbackInsert.data as RawSandboxProjectDbRow;
  const fallbackEntry = await syncProjectFallbackEntry(
    userId,
    createdRow.id,
    {
      primary_language: parsed.data.primaryLanguage,
      runtime_target: runtimeTarget,
      is_pinned: parsed.data.isPinned ?? false,
      tags: parsed.data.tags ?? [],
      repository_url: parsed.data.repositoryUrl ?? null,
      live_url: parsed.data.liveUrl ?? null,
    },
    client,
  );

  return normalizeSandboxProjectRow(createdRow, fallbackEntry);
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

  await assertAuthenticatedUserMatches(
    userId,
    client,
    (message) =>
      new SandboxProjectServiceError(message, {
        code: "AUTH_USER_MISMATCH",
        status: 403,
      }),
  );

  const nextLanguage = parsed.data.primaryLanguage;
  const coreUpdatePayload = {
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

  const extendedUpdatePayload = {
    ...(parsed.data.files !== undefined ? { files: parsed.data.files } : {}),
    ...(parsed.data.isPinned !== undefined
      ? { is_pinned: parsed.data.isPinned }
      : {}),
    ...(parsed.data.tags !== undefined ? { tags: parsed.data.tags } : {}),
    ...(parsed.data.repositoryUrl !== undefined
      ? { repository_url: parsed.data.repositoryUrl }
      : {}),
    ...(parsed.data.liveUrl !== undefined
      ? { live_url: parsed.data.liveUrl }
      : {}),
  };

  const { data, error, status } = await client
    .from("sandbox_projects")
    .update({
      ...coreUpdatePayload,
      ...extendedUpdatePayload,
    })
    .eq("id", projectId)
    .eq("user_id", userId)
    .eq("version", parsed.data.expectedVersion)
    .is("deleted_at", null)
    .select("*")
    .maybeSingle();

  if (!error) {
    if (!data) {
      throw new SandboxProjectConflictError();
    }
    return normalizeSandboxProjectRow(data as RawSandboxProjectDbRow);
  }

  if (!isSchemaMismatchError(error)) {
    throw toSandboxServiceError(error, status, "updateSandboxProject");
  }

  const legacyUpdatePayload = {
    ...coreUpdatePayload,
    ...(nextLanguage !== undefined
      ? {
          primary_language: toLegacySandboxLanguage(nextLanguage),
          runtime_target: resolveDefaultRuntimeTarget(
            toLegacySandboxLanguage(nextLanguage),
          ),
        }
      : {}),
  };

  const fallbackUpdate = await client
    .from("sandbox_projects")
    .update(legacyUpdatePayload)
    .eq("id", projectId)
    .eq("user_id", userId)
    .eq("version", parsed.data.expectedVersion)
    .is("deleted_at", null)
    .select("*")
    .maybeSingle();

  if (fallbackUpdate.error) {
    throw toSandboxServiceError(
      fallbackUpdate.error,
      fallbackUpdate.status,
      "updateSandboxProject.fallback",
    );
  }

  if (!fallbackUpdate.data) {
    throw new SandboxProjectConflictError();
  }

  const fallbackEntry = await syncProjectFallbackEntry(
    userId,
    projectId,
    {
      ...(nextLanguage !== undefined
        ? {
            primary_language: nextLanguage,
            runtime_target: resolveDefaultRuntimeTarget(nextLanguage),
          }
        : {}),
      ...(parsed.data.isPinned !== undefined
        ? { is_pinned: parsed.data.isPinned }
        : {}),
      ...(parsed.data.tags !== undefined ? { tags: parsed.data.tags } : {}),
      ...(parsed.data.repositoryUrl !== undefined
        ? { repository_url: parsed.data.repositoryUrl }
        : {}),
      ...(parsed.data.liveUrl !== undefined
        ? { live_url: parsed.data.liveUrl }
        : {}),
    },
    client,
  );

  return normalizeSandboxProjectRow(
    fallbackUpdate.data as RawSandboxProjectDbRow,
    fallbackEntry,
  );
}

export async function togglePinSandboxProject(
  userId: string,
  project: Pick<SandboxProjectRow, "id" | "is_pinned" | "version">,
  client: CoditSupabaseClient = requireSupabaseClient(),
): Promise<SandboxProjectRow> {
  return updateSandboxProject(
    userId,
    project.id,
    {
      isPinned: !project.is_pinned,
      expectedVersion: project.version,
    },
    client,
  );
}

export async function softDeleteSandboxProject(
  userId: string,
  projectId: string,
  client: CoditSupabaseClient = requireSupabaseClient(),
): Promise<boolean> {
  await assertAuthenticatedUserMatches(
    userId,
    client,
    (message) =>
      new SandboxProjectServiceError(message, {
        code: "AUTH_USER_MISMATCH",
        status: 403,
      }),
  );

  const { data, error, status } = await client
    .from("sandbox_projects")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", projectId)
    .eq("user_id", userId)
    .is("deleted_at", null)
    .select("id")
    .maybeSingle();

  if (error) {
    throw toSandboxServiceError(error, status, "softDeleteSandboxProject");
  }

  if (data !== null) {
    const existingMap = readProjectFallbackMap(userId);
    if (projectId in existingMap) {
      await syncProjectFallbackEntry(userId, projectId, null, client);
    }
  }

  return data !== null;
}

export async function recordSandboxProjectVersion(
  userId: string,
  project: Pick<
    SandboxProjectRow,
    "id" | "version" | "title" | "primary_language" | "source_code" | "files"
  >,
  summary?: string,
  client: CoditSupabaseClient = requireSupabaseClient(),
): Promise<SandboxProjectVersionRow | null> {
  await assertAuthenticatedUserMatches(
    userId,
    client,
    (message) =>
      new SandboxProjectServiceError(message, {
        code: "AUTH_USER_MISMATCH",
        status: 403,
      }),
  );

  const { data, error } = await client
    .from("sandbox_project_versions")
    .insert({
      project_id: project.id,
      user_id: userId,
      version: project.version,
      title: project.title,
      primary_language: project.primary_language,
      source_code: project.source_code,
      files: (project.files ?? null) as SandboxProjectFilesJson | null,
      summary: summary ? summary.slice(0, 140) : null,
    })
    .select("*")
    .maybeSingle();

  if (error) {
    if (isSchemaMismatchError(error) || isMissingDatabaseSchemaError(error)) {
      return null;
    }
    const meta = extractSupabaseErrorMeta(error, { status: null });
    if (meta.code === "23505") {
      return null;
    }
    return null;
  }

  return (data as SandboxProjectVersionRow | null) ?? null;
}

export async function listSandboxProjectVersions(
  userId: string,
  projectId: string,
  limit = 20,
  client: CoditSupabaseClient = requireSupabaseClient(),
): Promise<SandboxProjectVersionRow[]> {
  await assertAuthenticatedUserMatches(
    userId,
    client,
    (message) =>
      new SandboxProjectServiceError(message, {
        code: "AUTH_USER_MISMATCH",
        status: 403,
      }),
  );

  const safeLimit = Math.max(1, Math.min(50, Math.trunc(limit)));
  const { data, error, status } = await client
    .from("sandbox_project_versions")
    .select("*")
    .eq("project_id", projectId)
    .eq("user_id", userId)
    .order("version", { ascending: false })
    .limit(safeLimit);

  if (error) {
    if (isSchemaMismatchError(error) || isMissingDatabaseSchemaError(error)) {
      return [];
    }
    throw toSandboxServiceError(error, status, "listSandboxProjectVersions");
  }

  return (data ?? []) as SandboxProjectVersionRow[];
}

export function buildSandboxProblemDetails(
  error: unknown,
  fallbackTitle = "Falha no estúdio de código",
): ProblemDetails {
  if (error instanceof SandboxProjectConflictError) {
    return createProblemDetails({
      type: "https://codit.app/problems/sandbox-version-conflict",
      title: "Conflito de versão do projeto",
      status: 409,
      detail: error.message,
    });
  }

  if (error instanceof SandboxProjectValidationError) {
    return createProblemDetails({
      type: "https://codit.app/problems/sandbox-validation-error",
      title: "Dados inválidos no projeto",
      status: 400,
      detail: error.message,
    });
  }

  if (error instanceof SandboxProjectServiceError) {
    return createProblemDetails({
      type: "https://codit.app/problems/sandbox-service-error",
      title: fallbackTitle,
      status: error.status ?? 500,
      detail: error.message,
    });
  }

  return createProblemDetails({
    type: "https://codit.app/problems/sandbox-unexpected-error",
    title: fallbackTitle,
    status: 500,
    detail:
      error instanceof Error
        ? error.message
        : "Não foi possível concluir a operação no estúdio.",
  });
}
