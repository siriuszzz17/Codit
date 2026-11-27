import { describe, expect, it } from "vitest";
import { summarizeLearningAnalytics } from "@/modules/learning/learning-analytics-service";

describe("learning-analytics-service", () => {
  it("computes funnel averages and top failing assertion bottleneck across lessons", () => {
    const summary = summarizeLearningAnalytics([
      {
        track_slug: "python-fundamentos",
        track_title: "Python na Prática com Pyodide",
        lesson_id: "lesson-1",
        lesson_slug: "python-variaveis-e-print",
        lesson_title: "Variáveis, Tipos e Saída no Console",
        order_index: 1,
        total_learners: 10,
        completed_learners: 9,
        completion_rate: 90,
        total_attempts: 15,
        avg_attempts_to_pass: 1.5,
        avg_duration_seconds: 120,
        avg_hint_level: 0.5,
        max_hint_level_used: 2,
        top_failed_assertion_id: "var-idade",
        top_failed_assertion_label: "Variável idade deve ser inteiro positivo",
        top_failed_assertion_count: 3,
      },
      {
        track_slug: "python-fundamentos",
        track_title: "Python na Prática com Pyodide",
        lesson_id: "lesson-2",
        lesson_slug: "python-listas-e-medias",
        lesson_title: "Listas e Cálculo de Média",
        order_index: 2,
        total_learners: 10,
        completed_learners: 7,
        completion_rate: 70,
        total_attempts: 25,
        avg_attempts_to_pass: 2.5,
        avg_duration_seconds: 240,
        avg_hint_level: 1.5,
        max_hint_level_used: 3,
        top_failed_assertion_id: "media-correta",
        top_failed_assertion_label: "calcular_media([8, 9, 10]) == 9.0",
        top_failed_assertion_count: 8,
      },
    ]);

    expect(summary.totalLessons).toBe(2);
    expect(summary.totalAttempts).toBe(40);
    expect(summary.avgCompletionRate).toBe(80);
    expect(summary.avgAttemptsToPass).toBe(2);
    expect(summary.avgDurationSeconds).toBe(180);
    expect(summary.avgHintLevel).toBe(1);
    expect(summary.topBottleneck).toEqual({
      lessonTitle: "Listas e Cálculo de Média",
      assertionLabel: "calcular_media([8, 9, 10]) == 9.0",
      failCount: 8,
    });
  });

  it("returns zeroed summary for empty funnel", () => {
    const summary = summarizeLearningAnalytics([]);
    expect(summary.totalLessons).toBe(0);
    expect(summary.avgCompletionRate).toBe(0);
    expect(summary.topBottleneck).toBeNull();
  });
});
