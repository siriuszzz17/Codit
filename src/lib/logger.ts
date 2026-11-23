export type LogLevel = "info" | "warn" | "error";

export type LogContext = Record<string, unknown>;

const REDACTED_VALUE = "[REDACTED]";
const SENSITIVE_KEY_PATTERN =
  /password|passwd|secret|token|authorization|cookie|set-cookie|apikey|api_key|x-api-key|session|jwt|bearer|credential|private_key|database_url|email/i;

function sanitizeString(value: string): string {
  return value
    .replace(
      /(postgres(?:ql)?|https?|redis|amqps?):\/\/[^/\s:@]+:[^/\s@]+@/gi,
      "$1://[REDACTED]:[REDACTED]@",
    )
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [REDACTED]");
}

function sanitizeValue(value: unknown, seen: WeakSet<object>): unknown {
  if (value === null || typeof value !== "object") {
    if (typeof value === "string") {
      return sanitizeString(value);
    }
    if (typeof value === "bigint") {
      return value.toString();
    }
    return value;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      message: sanitizeString(value.message),
    };
  }

  if (seen.has(value)) {
    return "[Circular]";
  }
  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item, seen));
  }

  const sanitized: Record<string, unknown> = {};
  for (const [key, entryValue] of Object.entries(value)) {
    if (SENSITIVE_KEY_PATTERN.test(key)) {
      sanitized[key] = REDACTED_VALUE;
    } else {
      sanitized[key] = sanitizeValue(entryValue, seen);
    }
  }
  return sanitized;
}

export function sanitizeContext(
  context?: LogContext,
): Record<string, unknown> | undefined {
  if (!context) {
    return undefined;
  }
  const seen = new WeakSet<object>();
  return sanitizeValue(context, seen) as Record<string, unknown>;
}

function writeLog(level: LogLevel, event: string, context?: LogContext): void {
  const payload = {
    timestamp: new Date().toISOString(),
    level,
    event,
    ...(context !== undefined ? { context: sanitizeContext(context) } : {}),
  };

  const serialized = JSON.stringify(payload);
  if (level === "error") {
    console.error(serialized);
  } else if (level === "warn") {
    console.warn(serialized);
  } else {
    console.info(serialized);
  }
}

export function logInfo(event: string, context?: LogContext): void {
  writeLog("info", event, context);
}

export function logWarn(event: string, context?: LogContext): void {
  writeLog("warn", event, context);
}

export function logError(event: string, context?: LogContext): void {
  writeLog("error", event, context);
}
