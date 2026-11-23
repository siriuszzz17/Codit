import "server-only";
import { z } from "zod";

export type EnvSource = Record<string, string | undefined>;

export interface EnvIssue {
  path: string;
  message: string;
}

export class EnvValidationError extends Error {
  readonly issues: ReadonlyArray<EnvIssue>;

  constructor(scope: string, issues: ReadonlyArray<EnvIssue>) {
    const summary = issues
      .map((issue) => `${issue.path}: ${issue.message}`)
      .join("; ");
    super(`Invalid ${scope} environment configuration: ${summary}`);
    this.name = "EnvValidationError";
    this.issues = issues;
  }
}

function emptyStringToUndefined(value: unknown): unknown {
  if (typeof value === "string" && value.trim() === "") {
    return undefined;
  }
  return value;
}

function urlWithProtocols(protocols: ReadonlyArray<string>, fieldName: string) {
  return z
    .string({ error: `${fieldName} is required` })
    .trim()
    .min(1, `${fieldName} is required`)
    .refine((value) => {
      try {
        const parsed = new URL(value);
        return protocols.includes(parsed.protocol);
      } catch {
        return false;
      }
    }, `${fieldName} must be a valid URL using protocol ${protocols.join(" or ")}`);
}

const optionalNonEmptyString = z.preprocess(
  emptyStringToUndefined,
  z.string().trim().min(1).optional(),
);

const baseEnvSchema = z
  .object({
    NODE_ENV: z.preprocess(
      emptyStringToUndefined,
      z.enum(["development", "test", "production"]).default("development"),
    ),
    APP_BASE_URL: z.preprocess(
      emptyStringToUndefined,
      urlWithProtocols(["http:", "https:"], "APP_BASE_URL").default(
        "http://localhost:3000",
      ),
    ),
  })
  .superRefine((data, ctx) => {
    if (data.NODE_ENV === "production") {
      const parsed = new URL(data.APP_BASE_URL);
      if (parsed.protocol !== "https:") {
        ctx.addIssue({
          code: "custom",
          path: ["APP_BASE_URL"],
          message: "APP_BASE_URL must use https: when NODE_ENV is production",
        });
      }
    }
  });

const ALLOWED_PRODUCTION_SSL_MODES = new Set([
  "require",
  "verify-ca",
  "verify-full",
]);

const databaseEnvSchema = z.object({
  DATABASE_URL: urlWithProtocols(["postgres:", "postgresql:"], "DATABASE_URL"),
});

function createDatabaseEnvSchema(isProduction: boolean) {
  return databaseEnvSchema.superRefine((data, ctx) => {
    if (!isProduction) {
      return;
    }
    const sslMode = new URL(data.DATABASE_URL).searchParams.get("sslmode");
    if (!sslMode || !ALLOWED_PRODUCTION_SSL_MODES.has(sslMode)) {
      ctx.addIssue({
        code: "custom",
        path: ["DATABASE_URL"],
        message:
          "DATABASE_URL must specify sslmode=require, verify-ca, or verify-full in production",
      });
    }
  });
}

const authEnvSchema = z
  .object({
    AUTH_SECRET: z
      .string({ error: "AUTH_SECRET is required" })
      .trim()
      .min(32, "AUTH_SECRET must be at least 32 characters long"),
    GOOGLE_CLIENT_ID: optionalNonEmptyString,
    GOOGLE_CLIENT_SECRET: optionalNonEmptyString,
  })
  .superRefine((data, ctx) => {
    const hasClientId = Boolean(data.GOOGLE_CLIENT_ID);
    const hasClientSecret = Boolean(data.GOOGLE_CLIENT_SECRET);

    if (hasClientId && !hasClientSecret) {
      ctx.addIssue({
        code: "custom",
        path: ["GOOGLE_CLIENT_SECRET"],
        message: "GOOGLE_CLIENT_SECRET is required when GOOGLE_CLIENT_ID is set",
      });
    }

    if (!hasClientId && hasClientSecret) {
      ctx.addIssue({
        code: "custom",
        path: ["GOOGLE_CLIENT_ID"],
        message: "GOOGLE_CLIENT_ID is required when GOOGLE_CLIENT_SECRET is set",
      });
    }
  });

const octopyEnvSchema = z
  .object({
    AI_PROVIDER: z.enum(["gemini", "openai"], {
      error: "AI_PROVIDER must be 'gemini' or 'openai'",
    }),
    AI_PROVIDER_API_KEY: z
      .string({ error: "AI_PROVIDER_API_KEY is required" })
      .trim()
      .min(1, "AI_PROVIDER_API_KEY is required"),
    AI_FALLBACK_PROVIDER: z.preprocess(
      emptyStringToUndefined,
      z.enum(["gemini", "openai"]).optional(),
    ),
    AI_FALLBACK_API_KEY: optionalNonEmptyString,
  })
  .superRefine((data, ctx) => {
    const hasFallbackProvider = Boolean(data.AI_FALLBACK_PROVIDER);
    const hasFallbackApiKey = Boolean(data.AI_FALLBACK_API_KEY);

    if (hasFallbackProvider && !hasFallbackApiKey) {
      ctx.addIssue({
        code: "custom",
        path: ["AI_FALLBACK_API_KEY"],
        message:
          "AI_FALLBACK_API_KEY is required when AI_FALLBACK_PROVIDER is set",
      });
    }

    if (!hasFallbackProvider && hasFallbackApiKey) {
      ctx.addIssue({
        code: "custom",
        path: ["AI_FALLBACK_PROVIDER"],
        message:
          "AI_FALLBACK_PROVIDER is required when AI_FALLBACK_API_KEY is set",
      });
    }
  });

function createRemoteSandboxEnvSchema(isProduction: boolean) {
  const allowedProtocols = isProduction ? ["https:"] : ["http:", "https:"];
  return z.object({
    SANDBOX_API_URL: urlWithProtocols(allowedProtocols, "SANDBOX_API_URL"),
    SANDBOX_API_KEY: optionalNonEmptyString,
  });
}

export type BaseEnv = z.infer<typeof baseEnvSchema>;
export type DatabaseEnv = z.infer<typeof databaseEnvSchema>;
export type AuthEnv = z.infer<typeof authEnvSchema>;
export type OctopyEnv = z.infer<typeof octopyEnvSchema>;
export type RemoteSandboxEnv = z.infer<
  ReturnType<typeof createRemoteSandboxEnvSchema>
>;

function parseEnv<Schema extends z.ZodType>(
  schema: Schema,
  source: EnvSource,
  scope: string,
): z.infer<Schema> {
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    const issues: EnvIssue[] = parsed.error.issues.map((issue) => ({
      path: issue.path.length > 0 ? issue.path.join(".") : "env",
      message: issue.message,
    }));
    throw new EnvValidationError(scope, issues);
  }
  return parsed.data;
}

export function getBaseEnv(source: EnvSource = process.env): BaseEnv {
  return parseEnv(baseEnvSchema, source, "base");
}

export function requireDatabaseEnv(
  source: EnvSource = process.env,
): DatabaseEnv {
  const isProduction = (source.NODE_ENV ?? "").trim() === "production";
  return parseEnv(createDatabaseEnvSchema(isProduction), source, "database");
}

export function requireAuthEnv(source: EnvSource = process.env): AuthEnv {
  return parseEnv(authEnvSchema, source, "auth");
}

export function requireOctopyEnv(source: EnvSource = process.env): OctopyEnv {
  return parseEnv(octopyEnvSchema, source, "octopy");
}

export function requireRemoteSandboxEnv(
  source: EnvSource = process.env,
): RemoteSandboxEnv {
  const isProduction = (source.NODE_ENV ?? "").trim() === "production";
  return parseEnv(
    createRemoteSandboxEnvSchema(isProduction),
    source,
    "remote-sandbox",
  );
}
