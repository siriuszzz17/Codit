import { z } from "zod";

export const lessonHintSchema = z.object({
  level: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  title: z.string().trim().min(1).max(80),
  content: z.string().trim().min(1).max(1200),
});

export type LessonHint = z.infer<typeof lessonHintSchema>;

export const lessonTestCaseSchema = z.object({
  id: z.string().trim().min(1).max(40),
  label: z.string().trim().min(1).max(140),
  expression: z.string().trim().min(1).max(500),
  expected: z.unknown(),
});

export type LessonTestCase = z.infer<typeof lessonTestCaseSchema>;

export const recordLessonAttemptInputSchema = z.object({
  lessonId: z.string().uuid("Identificador de lição inválido."),
  code: z
    .string()
    .max(50_000, "O código excede o limite de 50.000 caracteres."),
  passed: z.boolean(),
  passedCases: z.number().int().min(0),
  totalCases: z.number().int().min(0),
  executionMs: z.number().int().min(0).max(60_000).default(0),
  hintLevelUsed: z.number().int().min(0).max(3).default(0),
  failedCaseIds: z.array(z.string().trim().min(1).max(64)).max(50).optional(),
});

export type RecordLessonAttemptInput = z.infer<
  typeof recordLessonAttemptInputSchema
>;

export const lessonSlugSchema = z
  .string()
  .trim()
  .min(1, "Slug da lição obrigatório.")
  .max(100, "Slug inválido.")
  .regex(/^[a-z0-9-]+$/, "Formato de slug inválido.");

export interface BadgeMeta {
  id: string;
  label: string;
  description: string;
  toneClass: string;
}

export const BADGE_CATALOG: Readonly<Record<string, BadgeMeta>> = {
  first_lesson: {
    id: "first_lesson",
    label: "Primeiro Código",
    description: "Concluiu a primeira lição prática no Codit.",
    toneClass:
      "border-emerald-500/35 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  },
  no_hint_solver: {
    id: "no_hint_solver",
    label: "Sem Dicas",
    description: "Resolveu um desafio sem revelar dicas do Octopy.",
    toneClass:
      "border-sky-500/35 bg-sky-500/10 text-sky-700 dark:text-sky-300",
  },
  streak_3: {
    id: "streak_3",
    label: "Ritmo 3 Dias",
    description: "Manteve uma sequência de 3 dias seguidos praticando.",
    toneClass:
      "border-amber-500/35 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  },
  js_fundamentals_complete: {
    id: "js_fundamentals_complete",
    label: "Base JS Completa",
    description: "Finalizou todas as lições de Fundamentos de JavaScript.",
    toneClass:
      "border-violet-500/35 bg-violet-500/10 text-violet-700 dark:text-violet-300",
  },
  python_fundamentals_complete: {
    id: "python_fundamentals_complete",
    label: "Base Python Completa",
    description: "Finalizou todas as lições de Python na Prática.",
    toneClass:
      "border-cyan-500/35 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300",
  },
};

export function getBadgeMeta(badgeId: string): BadgeMeta {
  const known = BADGE_CATALOG[badgeId];
  if (known) {
    return known;
  }
  return {
    id: badgeId,
    label: badgeId,
    description: "Conquista desbloqueada no Codit.",
    toneClass: "border-border bg-surface-muted text-foreground",
  };
}

export function calculateExpectedXp(
  baseXp: number,
  hintLevelUsed: number,
  alreadyCompleted: boolean,
): number {
  if (alreadyCompleted || baseXp <= 0) {
    return 0;
  }
  if (hintLevelUsed >= 3) {
    return Math.max(1, Math.floor(baseXp * 0.5));
  }
  return baseXp;
}

export function normalizeLessonHints(raw: unknown): LessonHint[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const parsed: LessonHint[] = [];
  for (const item of raw) {
    const result = lessonHintSchema.safeParse(item);
    if (result.success) {
      parsed.push(result.data);
    }
  }
  return parsed.sort((a, b) => a.level - b.level);
}

export function normalizeLessonTestCases(raw: unknown): LessonTestCase[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const parsed: LessonTestCase[] = [];
  for (const item of raw) {
    const result = lessonTestCaseSchema.safeParse(item);
    if (result.success) {
      parsed.push(result.data);
    }
  }
  return parsed;
}
