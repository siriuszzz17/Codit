import type { ProblemDetails } from "@/lib/problem-details";
import { getSupabaseClient } from "@/lib/supabase/client";

export const MAX_TELEMETRY_REPORTS_PER_SESSION = 5;
const MAX_MESSAGE_LENGTH = 300;
const MAX_ROUTE_LENGTH = 160;
const MAX_ERROR_TYPE_LENGTH = 120;

export type TelemetryErrorSource =
  | "window_error"
  | "unhandled_rejection"
  | "problem_details"
  | "pyodide_worker"
  | "manual";

export interface SanitizedErrorPayload {
  trace_id: string;
  source: TelemetryErrorSource;
  error_type: string;
  message: string;
  status_code: number | null;
  route: string;
  app_version: string;
  metadata: Record<string, string | number | boolean | null>;
}

export interface ReportClientErrorContext {
  source?: TelemetryErrorSource;
  route?: string;
  traceId?: string;
  statusCode?: number | null;
  metadata?: Record<string, unknown>;
}

export type ErrorReporterTransport = (
  payload: SanitizedErrorPayload,
) => Promise<void> | void;

const EMAIL_PATTERN = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const JWT_PATTERN = /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g;
const BEARER_PATTERN = /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi;
const SENSITIVE_QUERY_PARAM_PATTERN =
  /([?&](?:token|key|secret|auth|code|email|password|access_token|refresh_token)=)[^&\s#]+/gi;
const CPF_PATTERN = /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g;
const LOCAL_USER_PATH_PATTERN =
  /(?:[A-Za-z]:\\Users\\[^\\\s]+|\/Users\/[^/\s]+|\/home\/[^/\s]+)/g;

let sessionReportCount = 0;
const reportedFingerprints = new Set<string>();
let customTransport: ErrorReporterTransport | null = null;

export function sanitizeTelemetryText(
  raw: string,
  maxLength: number = MAX_MESSAGE_LENGTH,
): string {
  const cleaned = raw
    .replace(EMAIL_PATTERN, "[redacted-email]")
    .replace(JWT_PATTERN, "[redacted-jwt]")
    .replace(BEARER_PATTERN, "Bearer [redacted]")
    .replace(SENSITIVE_QUERY_PARAM_PATTERN, "$1[redacted]")
    .replace(CPF_PATTERN, "[redacted-doc]")
    .replace(LOCAL_USER_PATH_PATTERN, "[redacted-path]")
    .replace(/\s+/g, " ")
    .trim();

  if (cleaned.length <= maxLength) {
    return cleaned;
  }
  return `${cleaned.slice(0, Math.max(0, maxLength - 3))}...`;
}

export function sanitizeTelemetryRoute(rawRoute?: string): string {
  const candidate =
    rawRoute ??
    (typeof window !== "undefined" ? window.location.pathname : "/");
  const withoutQuery = candidate.split("?")[0]?.split("#")[0] ?? "/";
  const normalized = withoutQuery.startsWith("/")
    ? withoutQuery
    : `/${withoutQuery}`;
  return sanitizeTelemetryText(normalized, MAX_ROUTE_LENGTH) || "/";
}

function sanitizeMetadata(
  metadata?: Record<string, unknown>,
): Record<string, string | number | boolean | null> {
  if (!metadata) {
    return {};
  }

  const result: Record<string, string | number | boolean | null> = {};
  const entries = Object.entries(metadata).slice(0, 12);
  for (const [key, value] of entries) {
    const safeKey = key.replace(/[^a-zA-Z0-9_.-]/g, "").slice(0, 40);
    if (!safeKey) {
      continue;
    }

    if (value === null || typeof value === "boolean") {
      result[safeKey] = value;
    } else if (typeof value === "number" && Number.isFinite(value)) {
      result[safeKey] = value;
    } else if (typeof value === "string") {
      result[safeKey] = sanitizeTelemetryText(value, 140);
    }
  }
  return result;
}

function generateTelemetryTraceId(): string {
  if (
    typeof globalThis.crypto !== "undefined" &&
    typeof globalThis.crypto.randomUUID === "function"
  ) {
    return `req_${globalThis.crypto.randomUUID()}`;
  }
  return `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function extractErrorFields(error: unknown): {
  errorType: string;
  message: string;
} {
  if (error instanceof Error) {
    return {
      errorType: sanitizeTelemetryText(
        error.name || "Error",
        MAX_ERROR_TYPE_LENGTH,
      ),
      message: sanitizeTelemetryText(
        error.message || "Erro inesperado na aplicação.",
        MAX_MESSAGE_LENGTH,
      ),
    };
  }

  if (typeof error === "string") {
    return {
      errorType: "StringError",
      message: sanitizeTelemetryText(error, MAX_MESSAGE_LENGTH),
    };
  }

  return {
    errorType: "UnknownError",
    message: "Erro inesperado sem mensagem detalhada.",
  };
}

async function defaultSupabaseTransport(
  payload: SanitizedErrorPayload,
): Promise<void> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return;
  }

  const client = getSupabaseClient();
  if (!client) {
    return;
  }

  const {
    data: { session },
  } = await client.auth.getSession();
  const userId = session?.user?.id ?? null;
  if (!userId) {
    // Tabela client_error_logs aceita apenas usuários autenticados (RLS estrita).
    return;
  }

  await client.from("client_error_logs").insert({
    user_id: userId,
    trace_id: payload.trace_id,
    source: payload.source,
    error_type: payload.error_type,
    message: payload.message,
    status_code: payload.status_code,
    route: payload.route,
    app_version: payload.app_version,
    metadata: payload.metadata,
  });
}

async function dispatchSanitizedPayload(
  payload: SanitizedErrorPayload,
): Promise<boolean> {
  if (sessionReportCount >= MAX_TELEMETRY_REPORTS_PER_SESSION) {
    return false;
  }

  const fingerprint = `${payload.source}::${payload.error_type}::${payload.message}::${payload.route}`;
  if (reportedFingerprints.has(fingerprint)) {
    return false;
  }

  sessionReportCount += 1;
  reportedFingerprints.add(fingerprint);

  try {
    const transport = customTransport ?? defaultSupabaseTransport;
    await transport(payload);
    return true;
  } catch {
    return false;
  }
}

export async function reportClientError(
  error: unknown,
  context?: ReportClientErrorContext,
): Promise<boolean> {
  const { errorType, message } = extractErrorFields(error);
  const payload: SanitizedErrorPayload = {
    trace_id: sanitizeTelemetryText(
      context?.traceId ?? generateTelemetryTraceId(),
      80,
    ),
    source: context?.source ?? "manual",
    error_type: errorType,
    message,
    status_code:
      typeof context?.statusCode === "number" ? context.statusCode : null,
    route: sanitizeTelemetryRoute(context?.route),
    app_version: process.env.NEXT_PUBLIC_APP_VERSION ?? "0.0.0",
    metadata: sanitizeMetadata(context?.metadata),
  };

  return dispatchSanitizedPayload(payload);
}

export async function reportProblemDetails(
  problem: ProblemDetails,
  context?: { route?: string; source?: TelemetryErrorSource },
): Promise<boolean> {
  const payload: SanitizedErrorPayload = {
    trace_id: sanitizeTelemetryText(problem.traceId, 80),
    source: context?.source ?? "problem_details",
    error_type: sanitizeTelemetryText(problem.type, MAX_ERROR_TYPE_LENGTH),
    message: sanitizeTelemetryText(
      `${problem.title}: ${problem.detail}`,
      MAX_MESSAGE_LENGTH,
    ),
    status_code: problem.status,
    route: sanitizeTelemetryRoute(context?.route ?? problem.instance),
    app_version: process.env.NEXT_PUBLIC_APP_VERSION ?? "0.0.0",
    metadata: {},
  };

  return dispatchSanitizedPayload(payload);
}

export function installGlobalErrorHandlers(): () => void {
  if (typeof window === "undefined") {
    return () => {};
  }

  const handleWindowError = (event: ErrorEvent) => {
    void reportClientError(event.error ?? event.message, {
      source: "window_error",
      metadata: {
        lineno: event.lineno || null,
        colno: event.colno || null,
      },
    });
  };

  const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
    void reportClientError(event.reason, {
      source: "unhandled_rejection",
    });
  };

  window.addEventListener("error", handleWindowError);
  window.addEventListener("unhandledrejection", handleUnhandledRejection);

  return () => {
    window.removeEventListener("error", handleWindowError);
    window.removeEventListener("unhandledrejection", handleUnhandledRejection);
  };
}

export function getSessionTelemetryCount(): number {
  return sessionReportCount;
}

export function setErrorReporterTransportForTests(
  transport: ErrorReporterTransport | null,
): void {
  customTransport = transport;
}

export function resetErrorReporterStateForTests(): void {
  sessionReportCount = 0;
  reportedFingerprints.clear();
  customTransport = null;
}
