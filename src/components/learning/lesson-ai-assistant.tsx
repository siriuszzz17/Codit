"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { OctopyBadge } from "@/components/brand/octopy-badge";
import { LessonMarkdownBlocks } from "@/components/learning/lesson-markdown";
import { getSupabaseClient } from "@/lib/supabase/client";
import {
  LESSON_AI_MAX_INTERACTIONS,
  LESSON_AI_MAX_MESSAGE_LENGTH,
  LessonAiTutorError,
  requestLessonAiHelp,
  type FailedCasePayload,
} from "@/modules/learning/lesson-ai-tutor-service";
import { parseLessonMarkdown } from "@/modules/learning/lesson-markdown";

interface AiReplyItem {
  id: number;
  question: string | null;
  reply: string;
}

interface LessonAiAssistantProps {
  enunciado: string;
  codigoAtual: string;
  failedCases: readonly FailedCasePayload[];
  isAuthenticated: boolean;
}

export function LessonAiAssistant({
  enunciado,
  codigoAtual,
  failedCases,
  isAuthenticated,
}: LessonAiAssistantProps) {
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [replies, setReplies] = useState<AiReplyItem[]>([]);

  const usedCount = replies.length;
  const remaining = Math.max(0, LESSON_AI_MAX_INTERACTIONS - usedCount);
  const limitReached = remaining === 0;

  async function handleAskAi(event?: FormEvent) {
    event?.preventDefault();
    if (loading || limitReached || !isAuthenticated) {
      return;
    }

    const client = getSupabaseClient();
    if (!client) {
      setErrorMessage("Serviço do assistente indisponível no momento.");
      return;
    }

    const trimmedQuestion = question.trim();
    setLoading(true);
    setErrorMessage(null);

    try {
      const reply = await requestLessonAiHelp(
        {
          enunciado,
          codigoAtual,
          casosFalhados: [...failedCases],
          ...(trimmedQuestion ? { mensagemUsuario: trimmedQuestion } : {}),
        },
        client,
      );

      setReplies((prev) => [
        ...prev,
        {
          id: Date.now(),
          question: trimmedQuestion || null,
          reply,
        },
      ]);
      setQuestion("");
    } catch (err) {
      setErrorMessage(
        err instanceof LessonAiTutorError
          ? err.message
          : "Não foi possível consultar o assistente agora.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <section
      aria-labelledby="lesson-ai-assistant-title"
      className="rounded-2xl border border-border bg-surface p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <OctopyBadge
            size={36}
            variant={loading ? "coding" : "default"}
            decorative={false}
            className="shrink-0 rounded-xl"
          />
          <div className="min-w-0">
            <h2
              id="lesson-ai-assistant-title"
              className="text-sm font-bold text-foreground"
            >
              Assistente IA
            </h2>
            <p className="truncate text-xs text-muted">
              {failedCases.length > 0
                ? `${failedCases.length} ${failedCases.length === 1 ? "teste falhando" : "testes falhando"} enviado no contexto`
                : "Analisa seu código atual sem entregar a resposta pronta"}
            </p>
          </div>
        </div>

        <span
          className={`shrink-0 rounded-full border px-2.5 py-0.5 font-mono text-[11px] font-semibold ${
            limitReached
              ? "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300"
              : "border-border bg-surface-muted text-foreground"
          }`}
        >
          {usedCount}/{LESSON_AI_MAX_INTERACTIONS}
        </span>
      </div>

      {replies.length > 0 ? (
        <div className="mt-3 max-h-72 space-y-2.5 overflow-y-auto border-t border-border pt-3 pr-0.5">
          {replies.map((item, idx) => (
            <div
              key={item.id}
              className="rounded-xl border border-border bg-surface-muted/45 p-3"
            >
              {item.question ? (
                <p className="mb-1.5 text-xs font-semibold text-muted">
                  Você: {item.question}
                </p>
              ) : (
                <p className="mb-1.5 font-mono text-[11px] font-semibold text-muted">
                  Análise #{idx + 1}
                </p>
              )}
              <LessonMarkdownBlocks blocks={parseLessonMarkdown(item.reply)} />
            </div>
          ))}
        </div>
      ) : null}

      {loading ? (
        <div
          role="status"
          className="mt-3 flex items-center gap-2 rounded-xl border border-accent/35 bg-accent-soft/35 px-3 py-2.5 text-xs font-medium text-foreground"
        >
          <span
            aria-hidden="true"
            className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-accent"
          />
          <span>Analisando seu código e os testes...</span>
        </div>
      ) : null}

      {errorMessage ? (
        <div
          role="alert"
          className="mt-3 rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-700 dark:text-red-300"
        >
          {errorMessage}
        </div>
      ) : null}

      {!isAuthenticated ? (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-surface-muted/40 p-3 text-xs text-muted">
          <span>Entre na sua conta para pedir orientação da IA.</span>
          <Link
            href="/auth"
            className="inline-flex min-h-9 items-center justify-center rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-accent-foreground hover:opacity-90"
          >
            Entrar
          </Link>
        </div>
      ) : limitReached ? (
        <p className="mt-3 text-xs text-muted">
          Limite de {LESSON_AI_MAX_INTERACTIONS} interações nesta lição
          atingido. Revise as orientações acima e teste novamente.
        </p>
      ) : (
        <form
          onSubmit={(event) => void handleAskAi(event)}
          className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center"
        >
          <input
            type="text"
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            maxLength={LESSON_AI_MAX_MESSAGE_LENGTH}
            disabled={loading}
            aria-label="Dúvida específica opcional para o Assistente IA"
            placeholder="Dúvida opcional (ou clique direto para analisar)"
            className="min-h-10 min-w-0 flex-1 scroll-mt-4 rounded-xl border border-border bg-surface-muted/50 px-3 py-2 text-base text-foreground placeholder:text-muted focus:border-accent focus:outline-none disabled:opacity-60 sm:text-xs"
          />
          <button
            type="submit"
            disabled={loading}
            className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-xl bg-accent px-4 py-2 text-xs font-semibold text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {loading ? "Analisando..." : "Pedir ajuda à IA"}
          </button>
        </form>
      )}
    </section>
  );
}
