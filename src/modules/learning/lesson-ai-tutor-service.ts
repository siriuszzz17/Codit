import {
  requireSupabaseClient,
  type CoditSupabaseClient,
} from "@/lib/supabase/client";
import { assertHasAuthenticatedSession } from "@/lib/supabase/session-guard";
import type { AssertCaseResult } from "@/modules/learning/assert-runner";
import { normalizeLessonMarkdown } from "@/modules/learning/lesson-markdown";

export const LESSON_AI_MAX_INTERACTIONS = 3;
export const LESSON_AI_MAX_MESSAGE_LENGTH = 500;

export interface FailedCasePayload {
  nome: string;
  entrada: string;
  esperado: string;
  recebido: string;
}

export interface RequestLessonAiHelpInput {
  enunciado: string;
  codigoAtual: string;
  casosFalhados: FailedCasePayload[];
  mensagemUsuario?: string;
}

export class LessonAiTutorError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LessonAiTutorError";
  }
}

/**
 * Extrai somente os casos com status Falhou no formato enxuto esperado pela Edge Function.
 */
export function extractFailedCasesForAi(
  results: readonly AssertCaseResult[] | undefined,
): FailedCasePayload[] {
  if (!results || results.length === 0) {
    return [];
  }

  return results
    .filter((item) => !item.passed)
    .map((item) => ({
      nome: item.label,
      entrada: item.expression,
      esperado: item.expectedFormatted,
      recebido: item.errorMessage
        ? `Erro: ${item.errorMessage}`
        : item.actualFormatted,
    }));
}

async function extractInvokeErrorMessage(error: unknown): Promise<string> {
  if (typeof error === "object" && error !== null && "context" in error) {
    const ctx = (error as { context?: unknown }).context;
    if (ctx && typeof (ctx as Response).json === "function") {
      try {
        const body = (await (ctx as Response).clone().json()) as {
          error?: unknown;
        };
        if (typeof body?.error === "string" && body.error.trim()) {
          return body.error.trim();
        }
      } catch {
        // Fallback para mensagem padrão segura abaixo.
      }
    }
  }
  return "Não foi possível consultar o assistente agora. Tente novamente em instantes.";
}

export async function requestLessonAiHelp(
  input: RequestLessonAiHelpInput,
  client?: CoditSupabaseClient,
): Promise<string> {
  const supabase = client ?? requireSupabaseClient();
  await assertHasAuthenticatedSession(
    supabase,
    () =>
      new LessonAiTutorError("Entre na sua conta para usar o Assistente IA."),
  );

  if (typeof supabase.functions?.invoke !== "function") {
    throw new LessonAiTutorError("Assistente IA indisponível neste ambiente.");
  }

  const trimmedMessage = input.mensagemUsuario?.trim() ?? "";
  const body = {
    enunciado: normalizeLessonMarkdown(input.enunciado),
    codigoAtual: input.codigoAtual,
    casosFalhados: input.casosFalhados,
    ...(trimmedMessage
      ? { mensagemUsuario: trimmedMessage.slice(0, LESSON_AI_MAX_MESSAGE_LENGTH) }
      : {}),
  };

  const { data, error } = await supabase.functions.invoke("lesson-ai-tutor", {
    body,
  });

  if (error) {
    throw new LessonAiTutorError(await extractInvokeErrorMessage(error));
  }

  const reply =
    typeof data === "object" &&
    data !== null &&
    typeof (data as { reply?: unknown }).reply === "string"
      ? (data as { reply: string }).reply.trim()
      : "";

  if (!reply) {
    throw new LessonAiTutorError(
      "O assistente não retornou uma orientação. Tente novamente.",
    );
  }

  return reply;
}
