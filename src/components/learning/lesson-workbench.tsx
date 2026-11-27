"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { OctopyHintPanel } from "@/components/learning/octopy-hint-panel";
import { EmptyStateCard } from "@/components/ui/empty-state-card";
import { SkeletonList } from "@/components/ui/skeleton";
import { emitAppToast } from "@/lib/app-toast";
import { getSupabaseClient } from "@/lib/supabase/client";
import type { RecordLessonAttemptRpcResult } from "@/lib/supabase/database.types";
import { useAuth } from "@/modules/auth/auth-provider";
import {
  runLessonAssertions,
  type AssertRunSummary,
} from "@/modules/learning/assert-runner";
import {
  PYODIDE_EXECUTION_TIMEOUT_MS,
  runPythonLessonAssertions,
  type PyodideLoadProgress,
} from "@/modules/sandbox/pyodide-runner";
import { getBadgeMeta } from "@/modules/learning/learning-schemas";
import {
  getLessonBySlug,
  LearningServiceError,
  recordLessonAttempt,
  type LessonDetailBundle,
} from "@/modules/learning/learning-service";

export function LessonWorkbench() {
  const searchParams = useSearchParams();
  const slug = searchParams.get("slug")?.trim() ?? "";

  const { user, isLoading: isAuthLoading, isConfigured, refreshProfile } =
    useAuth();
  const userId = user?.id ?? null;

  const [bundle, setBundle] = useState<LessonDetailBundle | null>(null);
  const [loadedSlug, setLoadedSlug] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [code, setCode] = useState("");
  const [revealedHintLevel, setRevealedHintLevel] = useState(0);
  const [running, setRunning] = useState(false);
  const [savingAttempt, setSavingAttempt] = useState(false);
  const [runSummary, setRunSummary] = useState<AssertRunSummary | null>(null);
  const [pyodideProgress, setPyodideProgress] =
    useState<PyodideLoadProgress | null>(null);
  const [lastRpcResult, setLastRpcResult] =
    useState<RecordLessonAttemptRpcResult | null>(null);

  const loading =
    Boolean(slug) && isConfigured && (isAuthLoading || loadedSlug !== slug);

  useEffect(() => {
    if (!isConfigured || isAuthLoading || !slug) {
      return;
    }

    let cancelled = false;

    async function load() {
      const client = getSupabaseClient();
      if (!client) {
        await Promise.resolve();
        if (!cancelled) {
          setLoadedSlug(slug);
        }
        return;
      }

      try {
        const result = await getLessonBySlug(slug, userId, client);
        if (cancelled) return;
        setBundle(result);
        setRunSummary(null);
        setLastRpcResult(null);
        setErrorMessage(null);
        if (result) {
          setCode(result.progress?.best_code || result.lesson.starter_code);
          setRevealedHintLevel(result.progress?.max_hint_level_used ?? 0);
        }
        setLoadedSlug(slug);
      } catch (err) {
        if (cancelled) return;
        setBundle(null);
        setErrorMessage(
          err instanceof Error
            ? err.message
            : "Não foi possível carregar esta lição.",
        );
        setLoadedSlug(slug);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [isAuthLoading, isConfigured, slug, userId]);

  const alreadyCompleted =
    bundle?.progress?.status === "completed" ||
    lastRpcResult?.status === "completed";

  async function handleRunTests() {
    if (!bundle || running) {
      return;
    }

    setRunning(true);
    try {
      const isPython = bundle.lesson.language.toLowerCase() === "python";
      const summary = isPython
        ? await runPythonLessonAssertions(code, bundle.lesson.test_cases, {
            timeoutMs: PYODIDE_EXECUTION_TIMEOUT_MS,
            onProgress: (progress) => setPyodideProgress(progress),
          })
        : await runLessonAssertions(code, bundle.lesson.test_cases);
      setRunSummary(summary);
      if (isPython) {
        setPyodideProgress(null);
      }

      if (summary.timedOut) {
        emitAppToast({
          tone: "warning",
          title: "Execução interrompida por tempo limite",
          detail: isPython
            ? "Seu código Python excedeu 5 segundos e o Worker foi encerrado (RN-202)."
            : "Seu código excedeu 4 segundos. Verifique possíveis loops infinitos.",
        });
      }

      if (user) {
        const client = getSupabaseClient();
        if (client) {
          setSavingAttempt(true);
          try {
            const failedCaseIds = summary.results
              .filter((r) => !r.passed)
              .map((r) => r.id);
            const rpcResult = await recordLessonAttempt(
              {
                lessonId: bundle.lesson.id,
                code,
                passed: summary.passed,
                passedCases: summary.passedCount,
                totalCases: summary.totalCount,
                executionMs: summary.executionMs,
                hintLevelUsed: revealedHintLevel,
                failedCaseIds,
              },
              client,
            );
            setLastRpcResult(rpcResult);

            if (summary.passed) {
              if (rpcResult.xp_earned > 0) {
                emitAppToast({
                  tone: "success",
                  title: `Lição concluída (+${rpcResult.xp_earned} XP)`,
                  detail:
                    rpcResult.newly_unlocked_badges.length > 0
                      ? `Nova conquista: ${rpcResult.newly_unlocked_badges
                          .map((id) => getBadgeMeta(id).label)
                          .join(", ")}.`
                      : `Seu total agora é ${rpcResult.xp_total} XP.`,
                });
              } else {
                emitAppToast({
                  tone: "info",
                  title: "Todos os testes passaram",
                  detail: "Lição já concluída anteriormente (XP mantido).",
                });
              }
              await refreshProfile();
            }
          } catch (err) {
            if (!(err instanceof LearningServiceError)) {
              emitAppToast({
                tone: "error",
                title: "Erro ao registrar tentativa",
                detail: "Os testes rodaram, mas o progresso não pôde ser salvo.",
              });
            }
          } finally {
            setSavingAttempt(false);
          }
        }
      } else if (summary.passed) {
        emitAppToast({
          tone: "success",
          title: "Todos os testes passaram",
          detail: "Entre na sua conta para salvar o progresso e ganhar XP.",
        });
      }
    } finally {
      setRunning(false);
    }
  }

  function handleResetCode() {
    if (!bundle) return;
    setCode(bundle.lesson.starter_code);
    setRunSummary(null);
  }

  if (!slug) {
    return (
      <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
        <EmptyStateCard
          title="Nenhuma lição selecionada"
          description="Escolha uma lição na página de trilhas para abrir o ambiente de prática."
          action={{ label: "Ver trilhas", href: "/trilhas" }}
        />
      </main>
    );
  }

  if (loading) {
    return (
      <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
        <SkeletonList count={3} label="Carregando ambiente da lição..." />
      </main>
    );
  }

  if (errorMessage || !bundle) {
    return (
      <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
        <EmptyStateCard
          title="Lição não encontrada"
          description={
            errorMessage ??
            "Não encontramos essa lição publicada no catálogo do Codit."
          }
          action={{ label: "Voltar para trilhas", href: "/trilhas" }}
        />
      </main>
    );
  }

  const lessonPassed = Boolean(runSummary?.passed) || alreadyCompleted;
  const isPythonLesson = bundle.lesson.language.toLowerCase() === "python";

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-5 sm:px-6 sm:py-7">
      {/* Navegação superior da lição */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
            <Link
              href="/trilhas"
              className="font-semibold text-accent-strong hover:underline"
            >
              {bundle.track.title}
            </Link>
            <span aria-hidden="true">/</span>
            <span className="font-mono">
              Lição {String(bundle.lesson.order_index).padStart(2, "0")}
            </span>
          </div>
          <h1 className="text-xl font-extrabold tracking-tight text-foreground sm:text-2xl">
            {bundle.lesson.title}
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {bundle.previousLessonSlug ? (
            <Link
              href={`/trilhas/licao?slug=${encodeURIComponent(bundle.previousLessonSlug)}`}
              className="inline-flex min-h-9 items-center justify-center rounded-xl border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-foreground hover:border-accent"
            >
              Lição anterior
            </Link>
          ) : null}
          {bundle.nextLessonSlug ? (
            <Link
              href={`/trilhas/licao?slug=${encodeURIComponent(bundle.nextLessonSlug)}`}
              className="inline-flex min-h-9 items-center justify-center rounded-xl border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-foreground hover:border-accent"
            >
              Próxima lição
            </Link>
          ) : null}
        </div>
      </div>

      {/* Área dividida: Enunciado + Testes + Octopy | Editor + Console */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_1.15fr]">
        {/* Coluna esquerda */}
        <div className="space-y-4">
          <section
            aria-labelledby="lesson-instructions-title"
            className="rounded-2xl border border-border bg-surface p-5"
          >
            <h2
              id="lesson-instructions-title"
              className="text-sm font-bold text-foreground"
            >
              Enunciado
            </h2>
            <p className="mt-1 text-xs text-muted">{bundle.lesson.summary}</p>
            <div className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
              {bundle.lesson.content_md}
            </div>
          </section>

          {/* Casos de teste */}
          <section
            aria-labelledby="lesson-tests-title"
            className="rounded-2xl border border-border bg-surface p-4"
          >
            <div className="flex items-center justify-between gap-2">
              <h2
                id="lesson-tests-title"
                className="text-sm font-bold text-foreground"
              >
                Casos de teste ({bundle.lesson.test_cases.length})
              </h2>
              {runSummary ? (
                <span className="font-mono text-xs text-muted">
                  {runSummary.passedCount}/{runSummary.totalCount} aprovados ·{" "}
                  {runSummary.executionMs}ms
                </span>
              ) : null}
            </div>

            {pyodideProgress && pyodideProgress.stage !== "ready" ? (
              <div
                role="status"
                className="mt-3 space-y-1.5 rounded-xl border border-accent/35 bg-accent-soft/40 p-3 text-xs"
              >
                <div className="flex items-center justify-between gap-2 font-medium text-foreground">
                  <span>{pyodideProgress.label}</span>
                  <span className="font-mono text-[11px] text-accent-strong">
                    {pyodideProgress.percent}%
                  </span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-muted">
                  <div
                    className="h-full rounded-full bg-accent transition-all duration-300"
                    style={{ width: `${pyodideProgress.percent}%` }}
                  />
                </div>
              </div>
            ) : null}

            {runSummary?.runtimeError ? (
              <div
                role="alert"
                className="mt-3 rounded-xl border border-red-500/40 bg-red-500/10 p-3 font-mono text-xs text-red-700 dark:text-red-300"
              >
                {runSummary.runtimeError}
              </div>
            ) : null}

            <ul className="mt-3 space-y-2">
              {bundle.lesson.test_cases.map((tc) => {
                const res = runSummary?.results.find((r) => r.id === tc.id);
                const stateClass = !res
                  ? "border-border bg-surface-muted/40"
                  : res.passed
                    ? "border-emerald-500/40 bg-emerald-500/10"
                    : "border-red-500/40 bg-red-500/10";

                return (
                  <li
                    key={tc.id}
                    className={`rounded-xl border p-3 text-xs ${stateClass}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-foreground">
                        {tc.label}
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 font-mono text-[11px] font-bold ${
                          !res
                            ? "bg-surface text-muted"
                            : res.passed
                              ? "bg-emerald-600 text-white"
                              : "bg-red-600 text-white"
                        }`}
                      >
                        {!res ? "Aguardando" : res.passed ? "Passou" : "Falhou"}
                      </span>
                    </div>
                    <p className="mt-1 font-mono text-[11px] text-muted">
                      {tc.expression} === {JSON.stringify(tc.expected)}
                    </p>
                    {res && !res.passed ? (
                      <p className="mt-1 font-mono text-[11px] text-red-700 dark:text-red-300">
                        {res.errorMessage
                          ? `Erro: ${res.errorMessage}`
                          : `Recebido: ${res.actualFormatted}`}
                      </p>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </section>

          <OctopyHintPanel
            hints={bundle.lesson.hints}
            solutionCode={bundle.lesson.solution_code}
            baseXp={bundle.lesson.xp_reward}
            alreadyCompleted={alreadyCompleted}
            lessonPassed={lessonPassed}
            revealedLevel={revealedHintLevel}
            onRevealLevel={setRevealedHintLevel}
            onApplySolution={(solution) => {
              setCode(solution);
              emitAppToast({
                tone: "info",
                title: "Solução aplicada no editor",
                detail: "Execute os testes para validar e registrar sua lição.",
              });
            }}
          />
        </div>

        {/* Coluna direita: Editor técnico */}
        <div className="space-y-4">
          <section
            aria-label={
              isPythonLesson
                ? "Editor de código Python"
                : "Editor de código JavaScript"
            }
            className="codit-code-window overflow-hidden rounded-2xl border border-border bg-[#0f101a] text-[#eef0ff]"
          >
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 px-4 py-2.5">
              <div className="flex items-center gap-2">
                <span
                  className={
                    isPythonLesson
                      ? "rounded-md bg-sky-400/15 px-2 py-0.5 font-mono text-[11px] font-bold text-sky-300"
                      : "rounded-md bg-amber-400/15 px-2 py-0.5 font-mono text-[11px] font-bold text-amber-300"
                  }
                >
                  {isPythonLesson ? "PY" : "JS"}
                </span>
                <span className="font-mono text-xs text-white/80">
                  {isPythonLesson ? "solucao.py" : "solucao.js"}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleResetCode}
                  disabled={running}
                  className="inline-flex min-h-9 items-center justify-center rounded-lg border border-white/15 px-3 py-1 text-xs font-semibold text-white/80 transition-colors hover:border-white/35 hover:text-white disabled:opacity-50"
                >
                  Restaurar inicial
                </button>
                <button
                  type="button"
                  onClick={() => void handleRunTests()}
                  disabled={running || savingAttempt}
                  className="inline-flex min-h-9 items-center justify-center rounded-lg bg-accent px-4 py-1 text-xs font-semibold text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
                >
                  {running
                    ? "Executando..."
                    : savingAttempt
                      ? "Salvando..."
                      : "Executar testes"}
                </button>
              </div>
            </div>

            <textarea
              aria-label={
                isPythonLesson
                  ? "Código da solução em Python"
                  : "Código da solução em JavaScript"
              }
              value={code}
              onChange={(event) => setCode(event.target.value)}
              spellCheck={false}
              rows={15}
              className="block w-full resize-y bg-transparent p-4 font-mono text-xs leading-relaxed text-[#f4f5ff] focus:outline-none sm:text-sm"
            />
          </section>

          {/* Console de saída */}
          <section
            aria-label="Saída do console"
            className="rounded-2xl border border-border bg-surface p-4"
          >
            <p className="text-xs font-bold text-foreground">
              {isPythonLesson
                ? "Console isolado Pyodide (timeout 5s · máx. 16 KB)"
                : "Console isolado (timeout 4s)"}
            </p>
            {runSummary && runSummary.consoleLines.length > 0 ? (
              <pre className="mt-2 max-h-40 overflow-auto rounded-xl bg-surface-muted p-3 font-mono text-xs text-foreground">
                {runSummary.consoleLines.join("\n")}
              </pre>
            ) : (
              <p className="mt-1.5 text-xs text-muted">
                Use{" "}
                <code className="font-mono text-foreground">
                  {isPythonLesson ? "print(...)" : "console.log(...)"}
                </code>{" "}
                se quiser inspecionar valores durante os testes.
              </p>
            )}
          </section>

          {/* Banner de conclusão */}
          {runSummary?.passed ? (
            <div
              role="status"
              className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-4"
            >
              <div>
                <p className="text-sm font-bold text-emerald-700 dark:text-emerald-300">
                  Desafio concluído com sucesso!
                </p>
                <p className="mt-0.5 text-xs text-muted">
                  {lastRpcResult
                    ? lastRpcResult.xp_earned > 0
                      ? `+${lastRpcResult.xp_earned} XP creditados · Sequência atual: ${lastRpcResult.current_streak} ${lastRpcResult.current_streak === 1 ? "dia" : "dias"}.`
                      : "Lição já concluída anteriormente — seu progresso e XP permanecem intactos."
                    : "Todos os casos de teste passaram no sandbox isolado."}
                </p>
              </div>

              {bundle.nextLessonSlug ? (
                <Link
                  href={`/trilhas/licao?slug=${encodeURIComponent(bundle.nextLessonSlug)}`}
                  className="inline-flex min-h-10 items-center justify-center rounded-xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:opacity-90"
                >
                  Ir para próxima lição
                </Link>
              ) : (
                <Link
                  href="/trilhas"
                  className="inline-flex min-h-10 items-center justify-center rounded-xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:opacity-90"
                >
                  Voltar para trilhas
                </Link>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </main>
  );
}
