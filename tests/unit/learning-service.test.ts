import { describe, expect, it, vi } from "vitest";
import type { CoditSupabaseClient } from "@/lib/supabase/client";
import {
  calculateExpectedXp,
  getBadgeMeta,
  normalizeLessonHints,
  normalizeLessonTestCases,
  recordLessonAttemptInputSchema,
} from "@/modules/learning/learning-schemas";
import {
  computeTrackProgressSummary,
  LearningServiceError,
  recordLessonAttempt,
  type LessonWithProgress,
} from "@/modules/learning/learning-service";

describe("learning-schemas & gamification rules", () => {
  it("computes XP with 100% normal, 50% when solution revealed, and 0 on re-submission", () => {
    expect(calculateExpectedXp(50, 0, false)).toBe(50);
    expect(calculateExpectedXp(50, 1, false)).toBe(50);
    expect(calculateExpectedXp(50, 2, false)).toBe(50);
    expect(calculateExpectedXp(50, 3, false)).toBe(25);
    expect(calculateExpectedXp(50, 0, true)).toBe(0);
    expect(calculateExpectedXp(50, 3, true)).toBe(0);
  });

  it("normalizes and sorts Octopy hints by progressive level", () => {
    const hints = normalizeLessonHints([
      { level: 3, title: "Solução", content: "Código final" },
      { level: 1, title: "Conceito", content: "Ideia inicial" },
      { level: 99, title: "Inválido", content: "Ignorado" },
      { level: 2, title: "Pista", content: "Passo intermediário" },
    ]);

    expect(hints.map((h) => h.level)).toEqual([1, 2, 3]);
  });

  it("normalizes valid test cases and filters malformed entries", () => {
    const cases = normalizeLessonTestCases([
      { id: "c1", label: "Ok", expression: "f(1)", expected: 2 },
      { id: "", label: "Bad", expression: "f(1)", expected: 2 },
    ]);
    expect(cases).toHaveLength(1);
    expect(cases[0]?.id).toBe("c1");
  });

  it("returns known badge metadata and safe fallback for unknown badges", () => {
    expect(getBadgeMeta("first_lesson").label).toBe("Primeiro Código");
    expect(getBadgeMeta("js_fundamentals_complete").label).toBe("Base JS Completa");
    expect(getBadgeMeta("custom_badge").label).toBe("custom_badge");
  });

  it("validates recordLessonAttemptInputSchema bounds", () => {
    const valid = recordLessonAttemptInputSchema.safeParse({
      lessonId: "550e8400-e29b-41d4-a716-446655440000",
      code: "function saudar(n){return n;}",
      passed: true,
      passedCases: 3,
      totalCases: 3,
      executionMs: 14,
      hintLevelUsed: 1,
    });
    expect(valid.success).toBe(true);

    const invalidHint = recordLessonAttemptInputSchema.safeParse({
      lessonId: "550e8400-e29b-41d4-a716-446655440000",
      code: "x",
      passed: true,
      passedCases: 1,
      totalCases: 1,
      hintLevelUsed: 5,
    });
    expect(invalidHint.success).toBe(false);
  });
});

describe("learning-service", () => {
  it("computes track completion percentage and XP sum accurately", () => {
    const items = [
      { lesson: { xp_reward: 50 }, status: "completed" },
      { lesson: { xp_reward: 60 }, status: "completed" },
      { lesson: { xp_reward: 70 }, status: "in_progress" },
      { lesson: { xp_reward: 80 }, status: "not_started" },
    ] as unknown as LessonWithProgress[];

    const summary = computeTrackProgressSummary(items);
    expect(summary).toEqual({
      completedCount: 2,
      totalCount: 4,
      percentComplete: 50,
      totalXpAvailable: 260,
    });
  });

  it("calls record_lesson_attempt RPC and preserves non-duplicate XP on re-submit", async () => {
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({
        data: {
          status: "completed",
          already_completed: false,
          xp_earned: 50,
          xp_total: 50,
          current_streak: 1,
          badges: ["first_lesson", "no_hint_solver"],
          newly_unlocked_badges: ["first_lesson", "no_hint_solver"],
          attempts_count: 1,
          completed_at: "2026-11-26T20:00:00.000Z",
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: {
          status: "completed",
          already_completed: true,
          xp_earned: 0,
          xp_total: 50,
          current_streak: 1,
          badges: ["first_lesson", "no_hint_solver"],
          newly_unlocked_badges: [],
          attempts_count: 2,
          completed_at: "2026-11-26T20:00:00.000Z",
        },
        error: null,
      });

    const fakeClient = {
      auth: {
        getSession: vi.fn().mockResolvedValue({
          data: { session: { user: { id: "user-1" } } },
          error: null,
        }),
      },
      rpc,
    } as unknown as CoditSupabaseClient;

    const first = await recordLessonAttempt(
      {
        lessonId: "550e8400-e29b-41d4-a716-446655440000",
        code: "function saudar(n){return `Olá, ${n}!`;}",
        passed: true,
        passedCases: 3,
        totalCases: 3,
        executionMs: 9,
        hintLevelUsed: 0,
      },
      fakeClient,
    );
    expect(first.xp_earned).toBe(50);
    expect(first.already_completed).toBe(false);

    const second = await recordLessonAttempt(
      {
        lessonId: "550e8400-e29b-41d4-a716-446655440000",
        code: "function saudar(n){return `Olá, ${n}!`;}",
        passed: true,
        passedCases: 3,
        totalCases: 3,
        executionMs: 8,
        hintLevelUsed: 0,
      },
      fakeClient,
    );
    expect(second.xp_earned).toBe(0);
    expect(second.xp_total).toBe(50);
    expect(second.already_completed).toBe(true);
  });

  it("throws LearningServiceError on invalid lessonId before hitting Supabase", async () => {
    await expect(
      recordLessonAttempt({
        lessonId: "not-a-uuid",
        code: "1",
        passed: false,
        passedCases: 0,
        totalCases: 1,
        executionMs: 0,
        hintLevelUsed: 0,
      }),
    ).rejects.toBeInstanceOf(LearningServiceError);
  });
});
