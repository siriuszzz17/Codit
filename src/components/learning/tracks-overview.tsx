"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { OctopyBadge } from "@/components/brand/octopy-badge";
import { FirstStepsCard } from "@/components/onboarding/first-steps-card";
import { EmptyStateCard } from "@/components/ui/empty-state-card";
import { SkeletonList } from "@/components/ui/skeleton";
import { getSupabaseClient } from "@/lib/supabase/client";
import { useAuth } from "@/modules/auth/auth-provider";
import { getBadgeMeta } from "@/modules/learning/learning-schemas";
import {
  LearningServiceError,
  listPublishedTracksWithProgress,
  type TrackWithLessonsAndProgress,
} from "@/modules/learning/learning-service";

const DIFFICULTY_LABELS: Record<string, string> = {
  beginner: "Iniciante",
  intermediate: "Intermediário",
  advanced: "Avançado",
};

const STATUS_META = {
  completed: {
    label: "Concluída",
    className:
      "border-emerald-500/35 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  },
  in_progress: {
    label: "Em andamento",
    className:
      "border-amber-500/35 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  },
  not_started: {
    label: "Disponível",
    className: "border-border bg-surface-muted text-muted",
  },
} as const;

export function TracksOverview() {
  const { user, profile, isLoading: isAuthLoading, isConfigured } = useAuth();
  const [tracks, setTracks] = useState<TrackWithLessonsAndProgress[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [migrationMissing, setMigrationMissing] = useState(false);

  const userId = user?.id ?? null;

  useEffect(() => {
    if (!isConfigured || isAuthLoading) {
      return;
    }

    let cancelled = false;

    async function load() {
      const client = getSupabaseClient();
      if (!client) {
        if (!cancelled) {
          setLoading(false);
        }
        return;
      }

      setLoading(true);
      try {
        const result = await listPublishedTracksWithProgress(userId, client);
        if (cancelled) return;
        setTracks(result);
        setErrorMessage(null);
        setMigrationMissing(false);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof LearningServiceError) {
          setMigrationMissing(err.isMigrationMissing);
        }
        setErrorMessage(
          err instanceof Error
            ? err.message
            : "Não foi possível carregar as trilhas.",
        );
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [isAuthLoading, isConfigured, userId]);

  const totalCompletedLessons = tracks.reduce(
    (sum, item) => sum + item.completedCount,
    0,
  );
  const xpTotal = profile?.xp_total ?? 0;
  const currentStreak = profile?.current_streak ?? 0;
  const badges = profile?.badges ?? [];

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8">
      {/* Cabeçalho aberto (Warm Technical Craft) */}
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-5">
        <div className="space-y-1.5">
          <h1 className="text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl">
            Trilhas de Programação
          </h1>
          <p className="max-w-[64ch] text-sm leading-relaxed text-muted">
            Resolva desafios práticos com correção automática em sandbox isolado,
            dicas progressivas do Octopy e ganhe XP ao avançar.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/projetos"
            className="inline-flex min-h-10 items-center justify-center rounded-xl border border-border bg-surface px-4 py-2 text-xs font-semibold text-foreground transition-colors hover:border-accent"
          >
            Abrir estúdio
          </Link>
        </div>
      </header>

      {/* Faixa de gamificação do aluno */}
      {user ? (
        <section
          aria-label="Resumo de progresso e gamificação"
          className="space-y-3"
        >
          <div className="grid grid-cols-2 divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface sm:grid-cols-4 sm:divide-x sm:divide-y-0">
            <div className="px-4 py-3">
              <p className="text-[11px] font-medium text-muted">XP total</p>
              <p className="mt-0.5 font-mono text-lg font-bold text-foreground">
                {xpTotal} XP
              </p>
            </div>
            <div className="px-4 py-3">
              <p className="text-[11px] font-medium text-muted">Sequência</p>
              <p className="mt-0.5 font-mono text-lg font-bold text-foreground">
                {currentStreak} {currentStreak === 1 ? "dia" : "dias"}
              </p>
            </div>
            <div className="px-4 py-3">
              <p className="text-[11px] font-medium text-muted">
                Lições concluídas
              </p>
              <p className="mt-0.5 font-mono text-lg font-bold text-foreground">
                {totalCompletedLessons}
              </p>
            </div>
            <div className="px-4 py-3">
              <p className="text-[11px] font-medium text-muted">Badges</p>
              <p className="mt-0.5 font-mono text-lg font-bold text-foreground">
                {badges.length}
              </p>
            </div>
          </div>

          {badges.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2">
              {badges.map((badgeId) => {
                const meta = getBadgeMeta(badgeId);
                return (
                  <span
                    key={badgeId}
                    title={meta.description}
                    className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${meta.toneClass}`}
                  >
                    {meta.label}
                  </span>
                );
              })}
            </div>
          ) : null}
        </section>
      ) : !isAuthLoading ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-surface p-4">
          <div className="flex items-center gap-3">
            <OctopyBadge size={36} variant="coding" />
            <p className="text-xs leading-relaxed text-muted sm:text-sm">
              Entre na sua conta para salvar progresso, acumular XP, manter sua
              sequência diária e desbloquear badges no perfil.
            </p>
          </div>
          <Link
            href="/auth"
            className="inline-flex min-h-9 items-center justify-center rounded-xl bg-accent px-4 py-1.5 text-xs font-semibold text-accent-foreground hover:opacity-90"
          >
            Entrar para salvar XP
          </Link>
        </div>
      ) : null}

      <FirstStepsCard completedLessonsCount={totalCompletedLessons} />

      {!isConfigured ? (
        <EmptyStateCard
          title="Supabase não configurado"
          description="Configure as variáveis do Supabase em .env.local para carregar o catálogo de trilhas."
        />
      ) : loading ? (
        <SkeletonList count={3} label="Carregando trilhas de aprendizado..." />
      ) : migrationMissing ? (
        <div
          role="alert"
          className="space-y-2 rounded-2xl border border-amber-500/45 bg-amber-500/10 p-5 text-xs leading-relaxed text-foreground sm:text-sm"
        >
          <p className="font-bold">
            Migração das trilhas pendente no Supabase
          </p>
          <p className="text-muted">
            Execute o arquivo{" "}
            <code className="font-mono text-foreground">
              supabase/migrations/20261126000002_add_learning_mvp_and_gamification.sql
            </code>{" "}
            no SQL Editor do Supabase para criar as tabelas de trilhas, lições e
            gamificação.
          </p>
        </div>
      ) : errorMessage ? (
        <EmptyStateCard
          title="Não foi possível carregar as trilhas"
          description={errorMessage}
          action={{
            label: "Tentar novamente",
            onClick: () => window.location.reload(),
          }}
        />
      ) : tracks.length === 0 ? (
        <EmptyStateCard
          title="Nenhuma trilha publicada ainda"
          description="Assim que o catálogo inicial for aplicado no banco, as trilhas aparecerão aqui."
        />
      ) : (
        <div className="space-y-6">
          {tracks.map((item) => {
            const nextLesson =
              item.lessons.find((entry) => entry.status !== "completed") ??
              item.lessons[0];

            return (
              <section
                key={item.track.id}
                aria-labelledby={`track-${item.track.slug}`}
                className="overflow-hidden rounded-3xl border border-border bg-surface"
              >
                <div className="space-y-4 p-5 sm:p-6">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="rounded-full border border-border bg-surface-muted px-2.5 py-0.5 font-semibold text-foreground">
                          {DIFFICULTY_LABELS[item.track.difficulty] ??
                            item.track.difficulty}
                        </span>
                        <span className="font-mono text-muted">
                          {item.totalCount} lições · ~{item.track.estimated_minutes} min · até{" "}
                          {item.totalXpAvailable} XP
                        </span>
                      </div>

                      <h2
                        id={`track-${item.track.slug}`}
                        className="text-xl font-bold tracking-tight text-foreground"
                      >
                        {item.track.title}
                      </h2>
                      <p className="max-w-[65ch] text-sm leading-relaxed text-muted">
                        {item.track.description}
                      </p>
                    </div>

                    {nextLesson ? (
                      <Link
                        href={`/trilhas/licao?slug=${encodeURIComponent(nextLesson.lesson.slug)}`}
                        className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-xl bg-accent px-4 py-2 text-xs font-semibold text-accent-foreground transition-opacity hover:opacity-90 sm:text-sm"
                      >
                        {item.completedCount > 0 &&
                        item.completedCount < item.totalCount
                          ? "Continuar trilha"
                          : item.completedCount === item.totalCount &&
                              item.totalCount > 0
                            ? "Revisar trilha"
                            : "Começar trilha"}
                      </Link>
                    ) : null}
                  </div>

                  {/* Barra de progresso da trilha */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-foreground">
                        Progresso da trilha
                      </span>
                      <span className="font-mono text-muted">
                        {item.completedCount}/{item.totalCount} ({item.percentComplete}%)
                      </span>
                    </div>
                    <div
                      role="progressbar"
                      aria-valuenow={item.percentComplete}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label={`Progresso em ${item.track.title}`}
                      className="h-2.5 w-full overflow-hidden rounded-full bg-surface-muted"
                    >
                      <div
                        className="h-full rounded-full bg-accent transition-all duration-200"
                        style={{ width: `${item.percentComplete}%` }}
                      />
                    </div>
                  </div>
                </div>

                {/* Lista de lições */}
                <ol className="divide-y divide-border border-t border-border">
                  {item.lessons.map((entry, idx) => {
                    const statusMeta = STATUS_META[entry.status];
                    return (
                      <li key={entry.lesson.id}>
                        <Link
                          href={`/trilhas/licao?slug=${encodeURIComponent(entry.lesson.slug)}`}
                          className="group flex flex-wrap items-center justify-between gap-3 px-5 py-4 transition-colors hover:bg-surface-muted/45 sm:px-6"
                        >
                          <div className="flex min-w-0 items-start gap-3.5">
                            <span
                              className={`mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg font-mono text-xs font-bold ${
                                entry.status === "completed"
                                  ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                                  : "bg-surface-muted text-muted"
                              }`}
                            >
                              {String(idx + 1).padStart(2, "0")}
                            </span>
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-foreground group-hover:text-accent-strong">
                                {entry.lesson.title}
                              </p>
                              <p className="mt-0.5 text-xs text-muted">
                                {entry.lesson.summary}
                              </p>
                            </div>
                          </div>

                          <div className="flex shrink-0 items-center gap-2">
                            <span className="font-mono text-xs font-semibold text-muted">
                              +{entry.lesson.xp_reward} XP
                            </span>
                            <span
                              className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${statusMeta.className}`}
                            >
                              {statusMeta.label}
                            </span>
                          </div>
                        </Link>
                      </li>
                    );
                  })}
                </ol>
              </section>
            );
          })}
        </div>
      )}
    </main>
  );
}
