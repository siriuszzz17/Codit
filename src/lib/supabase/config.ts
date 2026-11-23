import { z } from "zod";

export interface SupabaseConfigIssue {
  path: string;
  message: string;
}

export class SupabaseConfigError extends Error {
  readonly issues: ReadonlyArray<SupabaseConfigIssue>;

  constructor(
    message = "A integração com o Supabase ainda não foi configurada. Defina NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY no arquivo .env.local.",
    issues: ReadonlyArray<SupabaseConfigIssue> = [],
  ) {
    super(message);
    this.name = "SupabaseConfigError";
    this.issues = issues;
  }
}

export interface RawSupabaseConfigInput {
  url?: string | undefined;
  anonKey?: string | undefined;
  authRedirectUrl?: string | undefined;
  nativeRedirectUrl?: string | undefined;
}

export interface SupabaseConfig {
  url: string;
  anonKey: string;
  authRedirectUrl?: string | undefined;
  nativeRedirectUrl?: string | undefined;
}

function emptyStringToUndefined(value: unknown): unknown {
  if (typeof value === "string" && value.trim() === "") {
    return undefined;
  }
  return value;
}

function isAllowedSupabaseUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.pathname.replace(/\/+$/, "") !== "") {
      return false;
    }
    if (parsed.search !== "" || parsed.hash !== "") {
      return false;
    }
    if (parsed.protocol === "https:") {
      return true;
    }
    if (
      parsed.protocol === "http:" &&
      (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1")
    ) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

function isAllowedRedirectUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    return (
      parsed.protocol === "https:" ||
      parsed.protocol === "http:" ||
      parsed.protocol === "com.codit.app:"
    );
  } catch {
    return false;
  }
}

function isAllowedNativeRedirectUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    return parsed.protocol === "com.codit.app:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

const supabaseConfigSchema = z.object({
  url: z
    .string({ error: "NEXT_PUBLIC_SUPABASE_URL é obrigatória." })
    .trim()
    .min(1, "NEXT_PUBLIC_SUPABASE_URL é obrigatória.")
    .refine(
      isAllowedSupabaseUrl,
      "NEXT_PUBLIC_SUPABASE_URL deve ser a URL raiz HTTPS do projeto (ex.: https://<ref>.supabase.co, sem /rest/v1).",
    )
    .transform((value) => value.replace(/\/+$/, "")),
  anonKey: z
    .string({ error: "NEXT_PUBLIC_SUPABASE_ANON_KEY é obrigatória." })
    .trim()
    .min(1, "NEXT_PUBLIC_SUPABASE_ANON_KEY é obrigatória."),
  authRedirectUrl: z.preprocess(
    emptyStringToUndefined,
    z
      .string()
      .trim()
      .refine(
        isAllowedRedirectUrl,
        "NEXT_PUBLIC_SUPABASE_AUTH_REDIRECT_URL deve ser uma URL válida.",
      )
      .transform((value) => value.replace(/\/+$/, ""))
      .optional(),
  ),
  nativeRedirectUrl: z.preprocess(
    emptyStringToUndefined,
    z
      .string()
      .trim()
      .refine(
        isAllowedNativeRedirectUrl,
        "NEXT_PUBLIC_SUPABASE_NATIVE_REDIRECT_URL deve usar esquema com.codit.app:// ou https://.",
      )
      .transform((value) => value.replace(/\/+$/, ""))
      .optional(),
  ),
});

export type SupabaseConfigValidationResult =
  | { ok: true; data: SupabaseConfig }
  | { ok: false; issues: ReadonlyArray<SupabaseConfigIssue> };

export function validateSupabaseConfig(
  input: RawSupabaseConfigInput,
): SupabaseConfigValidationResult {
  const parsed = supabaseConfigSchema.safeParse({
    url: input.url ?? "",
    anonKey: input.anonKey ?? "",
    authRedirectUrl: input.authRedirectUrl,
    nativeRedirectUrl: input.nativeRedirectUrl,
  });

  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.error.issues.map((issue) => ({
        path: issue.path.length > 0 ? issue.path.join(".") : "supabase",
        message: issue.message,
      })),
    };
  }

  return { ok: true, data: parsed.data };
}

export function parseSupabaseConfig(
  input: RawSupabaseConfigInput,
): SupabaseConfig | null {
  const result = validateSupabaseConfig(input);
  return result.ok ? result.data : null;
}

export function getRuntimeSupabaseConfig(): SupabaseConfig | null {
  // Acesso literal obrigatório para o bundler do Next.js embutir em export estático.
  return parseSupabaseConfig({
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    authRedirectUrl: process.env.NEXT_PUBLIC_SUPABASE_AUTH_REDIRECT_URL,
    nativeRedirectUrl: process.env.NEXT_PUBLIC_SUPABASE_NATIVE_REDIRECT_URL,
  });
}

export function isSupabaseConfigured(): boolean {
  return getRuntimeSupabaseConfig() !== null;
}
