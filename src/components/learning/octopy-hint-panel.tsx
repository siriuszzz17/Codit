"use client";

import { useState } from "react";
import { OctopyBadge, type OctopyVariant } from "@/components/brand/octopy-badge";
import {
  calculateExpectedXp,
  type LessonHint,
} from "@/modules/learning/learning-schemas";

interface OctopyHintPanelProps {
  hints: readonly LessonHint[];
  solutionCode: string;
  baseXp: number;
  alreadyCompleted: boolean;
  lessonPassed: boolean;
  revealedLevel: number;
  onRevealLevel: (level: number) => void;
  onApplySolution: (code: string) => void;
}

const LEVEL_LABELS: Record<1 | 2 | 3, string> = {
  1: "Dica 1 · Conceito",
  2: "Dica 2 · Pista prática",
  3: "Solução guiada (50% XP)",
};

export function OctopyHintPanel({
  hints,
  solutionCode,
  baseXp,
  alreadyCompleted,
  lessonPassed,
  revealedLevel,
  onRevealLevel,
  onApplySolution,
}: OctopyHintPanelProps) {
  const [confirmSolution, setConfirmSolution] = useState(false);

  const variant: OctopyVariant = lessonPassed
    ? "happy"
    : revealedLevel >= 2
      ? "headphones"
      : revealedLevel === 1
        ? "coding"
        : "default";

  const expectedXp = calculateExpectedXp(
    baseXp,
    revealedLevel,
    alreadyCompleted,
  );
  const reducedXp = calculateExpectedXp(baseXp, 3, alreadyCompleted);

  const visibleHints = hints.filter((hint) => hint.level <= revealedLevel);
  const nextLevel = revealedLevel < 3 ? ((revealedLevel + 1) as 1 | 2 | 3) : null;
  const hasNextHint =
    nextLevel !== null && hints.some((hint) => hint.level === nextLevel);

  function handleRequestNext() {
    if (nextLevel === null) {
      return;
    }
    if (nextLevel === 3 && !confirmSolution && !alreadyCompleted) {
      setConfirmSolution(true);
      return;
    }
    setConfirmSolution(false);
    onRevealLevel(nextLevel);
  }

  return (
    <section
      aria-labelledby="octopy-tutor-title"
      className="rounded-2xl border border-border bg-surface p-4"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <OctopyBadge
            size={40}
            variant={variant}
            decorative={false}
            className="shrink-0 rounded-xl"
          />
          <div>
            <h2
              id="octopy-tutor-title"
              className="text-sm font-bold text-foreground"
            >
              Tutor Octopy
            </h2>
            <p className="text-xs text-muted">
              {lessonPassed
                ? "Mandou bem! Todos os testes passaram."
                : revealedLevel === 0
                  ? "Tente resolver primeiro. Se travar, peça uma dica progressiva."
                  : `Nível ${revealedLevel} de 3 liberado.`}
            </p>
          </div>
        </div>

        {!alreadyCompleted ? (
          <span className="shrink-0 rounded-full border border-border bg-surface-muted px-2.5 py-1 font-mono text-[11px] font-semibold text-foreground">
            +{expectedXp} XP
          </span>
        ) : (
          <span className="shrink-0 rounded-full border border-emerald-500/35 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
            Concluída
          </span>
        )}
      </div>

      {visibleHints.length > 0 ? (
        <ol className="mt-3 space-y-2 border-t border-border pt-3">
          {visibleHints.map((hint) => (
            <li
              key={hint.level}
              className={`rounded-xl border p-3 text-xs leading-relaxed ${
                hint.level === 3
                  ? "border-amber-500/35 bg-amber-500/10 text-foreground"
                  : "border-border bg-surface-muted/50 text-foreground"
              }`}
            >
              <p className="font-semibold text-foreground">
                {LEVEL_LABELS[hint.level]}
              </p>
              <p className="mt-1 text-muted">{hint.content}</p>
            </li>
          ))}
        </ol>
      ) : null}

      {confirmSolution ? (
        <div
          role="alert"
          className="mt-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-foreground"
        >
          <p className="font-semibold">
            Revelar a solução reduz a recompensa para +{reducedXp} XP (50%).
          </p>
          <p className="mt-1 text-muted">
            Deseja abrir a solução comentada mesmo assim?
          </p>
          <div className="mt-2.5 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                setConfirmSolution(false);
                onRevealLevel(3);
              }}
              className="inline-flex min-h-9 items-center justify-center rounded-xl bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-90"
            >
              Revelar solução
            </button>
            <button
              type="button"
              onClick={() => setConfirmSolution(false)}
              className="inline-flex min-h-9 items-center justify-center rounded-xl border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-foreground hover:border-accent"
            >
              Continuar tentando
            </button>
          </div>
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {hasNextHint && nextLevel !== null && !confirmSolution ? (
          <button
            type="button"
            onClick={handleRequestNext}
            className="inline-flex min-h-9 items-center justify-center rounded-xl border border-border bg-surface-muted px-3.5 py-1.5 text-xs font-semibold text-foreground transition-colors hover:border-accent hover:text-accent-strong"
          >
            {nextLevel === 1
              ? "Pedir dica 1"
              : nextLevel === 2
                ? "Pedir dica 2"
                : "Ver solução"}
          </button>
        ) : null}

        {revealedLevel >= 3 ? (
          <button
            type="button"
            onClick={() => onApplySolution(solutionCode)}
            className="inline-flex min-h-9 items-center justify-center rounded-xl bg-accent px-3.5 py-1.5 text-xs font-semibold text-accent-foreground transition-opacity hover:opacity-90"
          >
            Aplicar solução no editor
          </button>
        ) : null}
      </div>
    </section>
  );
}
