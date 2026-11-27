import { getSupabaseClient } from "@/lib/supabase/client";
import type { ProblemDetails } from "@/lib/problem-details";

export interface CaptureErrorEventInput {
  traceId?: string | undefined;
  source?: "frontend" | "api" | "worker" | undefined;
  severity?: "warning" | "error" | "fatal" | undefined;
  title: string;
  message: string;
  stack?: string | null | undefined;
  route?: string | null | undefined;
  problemType?: string | null | undefined;
  statusCode?: number | null | undefined;
  context?: Record<string, unknown> | undefined;
}

const RECENT_ERROR_SIGNATURES = new Map<string, number>();
const DEDUP_WINDOW_MS = 10_000;

function shouldSkipDuplicate(signature: string): boolean {
  const now = Date.now();
  const prev = RECENT_ERROR_SIGNATURES.get(signature);
  if (prev !== undefined && now - prev < DEDUP_WINDOW_MS) {
    return true;
  }
  RECENT_ERROR_SIGNATURES.set(signature, now);
  if (RECENT_ERROR_SIGNATURES.size > 50) {
    const firstKey = RECENT_ERROR_SIGNATURES.keys().next().value;
    if (firstKey !== undefined) {
      RECENT_ERROR_SIGNATURES.delete(firstKey);
    }
  }
  return false;
}

export async function captureErrorEvent(
  input: CaptureErrorEventInput,
): Promise<void> {
  const cleanTitle = input.title.trim().slice(0, 160) || "Erro inesperado";
  const cleanMessage =
    input.message.trim().slice(0, 2000) || "Falha não especificada.";
  const signature = `${input.source ?? "frontend"}:${cleanTitle}:${cleanMessage.slice(0, 120)}`;

  if (shouldSkipDuplicate(signature)) {
    return;
  }

  const client = getSupabaseClient();
  if (!client) {
    return;
  }

  try {
    const { data: sessionData } = await client.auth.getSession();
    const userId = sessionData.session?.user?.id ?? null;
    const traceId =
      input.traceId?.trim().slice(0, 80) ||
      `err_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

    await client.from("error_events").insert({
      user_id: userId,
      trace_id: traceId,
      source: input.source ?? "frontend",
      severity: input.severity ?? "error",
      title: cleanTitle,
      message: cleanMessage,
      stack: input.stack ? input.stack.slice(0, 4000) : null,
      route:
        input.route ??
        (typeof window !== "undefined" ? window.location.pathname : null),
      problem_type: input.problemType ?? null,
      status_code: input.statusCode ?? null,
      context_json: input.context ?? {},
    });
  } catch {
    // Observabilidade nunca deve quebrar o fluxo do usuário.
  }
}

export function reportProblemDetails(
  problem: ProblemDetails,
  extra?: {
    source?: "frontend" | "api" | "worker" | undefined;
    context?: Record<string, unknown> | undefined;
  },
): void {
  void captureErrorEvent({
    traceId: problem.traceId,
    source: extra?.source ?? "api",
    severity: problem.status >= 500 ? "fatal" : "error",
    title: problem.title,
    message: problem.detail,
    route: problem.instance,
    problemType: problem.type,
    statusCode: problem.status,
    context: extra?.context,
  });
}
