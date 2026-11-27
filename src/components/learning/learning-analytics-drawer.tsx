"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { EmptyStateCard } from "@/components/ui/empty-state-card";
import { SkeletonList } from "@/components/ui/skeleton";
import { useDialogA11y } from "@/hooks/use-dialog-a11y";
import { getSupabaseClient } from "@/lib/supabase/client";
import {
  fetchLearningRetentionAnalytics,
  type LearningAnalyticsPayload,
} from "@/modules/learning/learning-analytics-service";

interface LearningAnalyticsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  trackSlug?: string | null;
}

function formatDurationSeconds(seconds: number): string {
  if (!seconds || seconds <= 0) {
    return "0s";
  }
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  if (mins === 0) {
    return `${secs}s`;
  }
  return `${mins}m ${secs}s`;
}

export function LearningAnalyticsDrawer({
  isOpen,
  onClose,
  trackSlug = null,
}: LearningAnalyticsDrawerProps) {
  const drawerRef = useRef<HTMLDivElement | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [payload, setPayload] = useState<LearningAnalyticsPayload | null>(null);

  useDialogA11y({
    open: isOpen,
    containerRef: drawerRef,
    onClose,
  });

  const loadAnalytics = useCallback(async () => {
    const client = getSupabaseClient();
    if (!client) {
      setError("Cliente Supabase não configurado.");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const data = await fetchLearningRetentionAnalytics(client, trackSlug);
      setPayload(data);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Não foi possível carregar as métricas de aprendizado.",
      );
    } finally {
      setLoading(false);
    }
  }, [trackSlug]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    let cancelled = false;

    async function fetchInitial() {
      const client = getSupabaseClient();
      if (!client) {
        await Promise.resolve();
        if (!cancelled) {
          setError("Cliente Supabase não configurado.");
        }
        return;
      }

      await Promise.resolve();
      if (cancelled) {
        return;
      }

      setLoading(true);
      setError(null);
      try {
        const data = await fetchLearningRetentionAnalytics(client, trackSlug);
        if (!cancelled) {
          setPayload(data);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : "Não foi possível carregar as métricas de aprendizado.",
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void fetchInitial();

    return () => {
      cancelled = true;
    };
  }, [isOpen, trackSlug]);

  if (!isOpen) {
    return null;
  }

  const summary = payload?.summary;
  const rows = payload?.rows ?? [];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="learning-analytics-title"
      className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-xs"
    >
      <div
        ref={drawerRef}
        className="flex h-dvh w-full max-w-2xl flex-col border-l border-border bg-surface-elevated shadow-2xl"
      >
        <header className="flex items-center justify-between gap-3 border-b border-border bg-surface-muted/60 px-5 py-4">
          <div className="min-w-0">
            <h2
              id="learning-analytics-title"
              className="truncate text-base font-bold text-foreground sm:text-lg"
            >
              Métricas de aprendizado
            </h2>
            <p className="text-xs text-muted">
              Funil de retenção por lição, dicas do Octopy e gargalos de validação.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void loadAnalytics()}
              disabled={loading}
              className="inline-flex min-h-9 items-center justify-center rounded-xl border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:border-accent disabled:opacity-60"
            >
              {loading ? "Atualizando..." : "Atualizar"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex min-h-9 items-center justify-center rounded-xl border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:border-accent"
            >
              Fechar
            </button>
          </div>
        </header>

        <div className="flex-1 space-y-5 overflow-y-auto p-5">
          {error ? (
            <div
              role="alert"
              className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-xs text-foreground"
            >
              {error}
            </div>
          ) : null}

          {loading && !payload ? (
            <SkeletonList count={4} label="Carregando funil de aprendizado..." />
          ) : payload?.migrationMissing ? (
            <EmptyStateCard
              title="Migração de analytics pendente"
              description="Aplique a migração 20261126000004_add_python_track_and_telemetry.sql no Supabase para ativar o funil por lição e a telemetria."
            />
          ) : (
            <>
              {summary ? (
                <section
                  aria-label="Resumo geral de aprendizado"
                  className="grid grid-cols-2 gap-3 sm:grid-cols-4"
                >
                  <div className="rounded-xl border border-border bg-surface p-3">
                    <p className="text-[11px] font-medium text-muted">
                      Conclusão média
                    </p>
                    <p className="mt-1 text-xl font-bold text-foreground">
                      {summary.avgCompletionRate}%
                    </p>
                  </div>
                  <div className="rounded-xl border border-border bg-surface p-3">
                    <p className="text-[11px] font-medium text-muted">
                      Tentativas médias
                    </p>
                    <p className="mt-1 text-xl font-bold text-foreground">
                      {summary.avgAttemptsToPass}
                    </p>
                  </div>
                  <div className="rounded-xl border border-border bg-surface p-3">
                    <p className="text-[11px] font-medium text-muted">
                      Tempo médio
                    </p>
                    <p className="mt-1 text-xl font-bold text-foreground">
                      {formatDurationSeconds(summary.avgDurationSeconds)}
                    </p>
                  </div>
                  <div className="rounded-xl border border-border bg-surface p-3">
                    <p className="text-[11px] font-medium text-muted">
                      Nível médio Octopy
                    </p>
                    <p className="mt-1 text-xl font-bold text-foreground">
                      N{summary.avgHintLevel}
                    </p>
                  </div>
                </section>
              ) : null}

              {summary?.topBottleneck ? (
                <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3.5 text-xs">
                  <p className="font-semibold text-foreground">
                    Principal gargalo detectado: {summary.topBottleneck.lessonTitle}
                  </p>
                  <p className="mt-1 text-muted">
                    Critério que mais reprova: &ldquo;{summary.topBottleneck.assertionLabel}&rdquo; (
                    {summary.topBottleneck.failCount}{" "}
                    {summary.topBottleneck.failCount === 1 ? "falha" : "falhas"}).
                  </p>
                </div>
              ) : null}

              {rows.length === 0 ? (
                <EmptyStateCard
                  title="Nenhuma lição registrada ainda"
                  description="Assim que tentativas de exercícios Python ou web forem executadas, o funil de conclusão e retenção aparecerá aqui."
                />
              ) : (
                <section aria-label="Funil por lição" className="space-y-3">
                  <h3 className="text-sm font-semibold text-foreground">
                    Funil por lição ({rows.length})
                  </h3>

                  <ul className="space-y-2.5">
                    {rows.map((row) => (
                      <li
                        key={row.lesson_id}
                        className="rounded-2xl border border-border bg-surface p-4"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <p className="text-sm font-semibold text-foreground">
                              {row.lesson_title}
                            </p>
                            <p className="text-xs text-muted">{row.track_title}</p>
                          </div>
                          <span className="rounded-full border border-border bg-surface-muted px-2.5 py-0.5 text-xs font-semibold text-foreground">
                            {row.completion_rate}% concluído
                          </span>
                        </div>

                        <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-surface-muted">
                          <div
                            className="h-full rounded-full bg-accent transition-all"
                            style={{
                              width: `${Math.min(100, Math.max(0, row.completion_rate))}%`,
                            }}
                          />
                        </div>

                        <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                          <div>
                            <span className="text-muted">Tentativas:</span>{" "}
                            <strong className="text-foreground">
                              {row.total_attempts} (média {row.avg_attempts_to_pass})
                            </strong>
                          </div>
                          <div>
                            <span className="text-muted">Tempo médio:</span>{" "}
                            <strong className="text-foreground">
                              {formatDurationSeconds(row.avg_duration_seconds)}
                            </strong>
                          </div>
                          <div>
                            <span className="text-muted">Dica Octopy:</span>{" "}
                            <strong className="text-foreground">
                              N{row.avg_hint_level} (máx N{row.max_hint_level_used})
                            </strong>
                          </div>
                        </div>

                        {row.top_failed_assertion_label ? (
                          <p className="mt-2.5 rounded-lg border border-red-500/25 bg-red-500/10 px-2.5 py-1.5 text-xs text-foreground">
                            <span className="font-semibold">
                              Assert que mais reprova:
                            </span>{" "}
                            {row.top_failed_assertion_label} (
                            {row.top_failed_assertion_count}x)
                          </p>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
