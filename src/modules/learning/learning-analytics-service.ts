import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  Database,
  LearningRetentionAnalyticsRow,
  SandboxRuntimeTarget,
} from "@/lib/supabase/database.types";
import {
  isMissingDatabaseSchemaError,
  mapSupabaseDatabaseError,
} from "@/lib/supabase/errors";
import { assertAuthenticatedUserMatches } from "@/lib/supabase/session-guard";

export interface RecordLearningAttemptInput {
  lessonId: string;
  passed: boolean;
  durationSeconds: number;
  hintLevelUsed?: number;
  failedAssertionId?: string | null;
  failedAssertionLabel?: string | null;
  runtimeTarget?: SandboxRuntimeTarget;
}

export interface LearningAnalyticsSummary {
  totalLessons: number;
  totalAttempts: number;
  avgCompletionRate: number;
  avgAttemptsToPass: number;
  avgDurationSeconds: number;
  avgHintLevel: number;
  topBottleneck: {
    lessonTitle: string;
    assertionLabel: string;
    failCount: number;
  } | null;
}

export interface LearningAnalyticsPayload {
  rows: LearningRetentionAnalyticsRow[];
  summary: LearningAnalyticsSummary;
  migrationMissing: boolean;
}

export function summarizeLearningAnalytics(
  rows: ReadonlyArray<LearningRetentionAnalyticsRow>,
): LearningAnalyticsSummary {
  if (rows.length === 0) {
    return {
      totalLessons: 0,
      totalAttempts: 0,
      avgCompletionRate: 0,
      avgAttemptsToPass: 0,
      avgDurationSeconds: 0,
      avgHintLevel: 0,
      topBottleneck: null,
    };
  }

  let totalAttempts = 0;
  let completionSum = 0;
  let attemptsToPassSum = 0;
  let attemptsToPassCount = 0;
  let durationSum = 0;
  let durationCount = 0;
  let hintSum = 0;
  let hintCount = 0;
  let topBottleneck: LearningAnalyticsSummary["topBottleneck"] = null;

  for (const row of rows) {
    const attempts = Number(row.total_attempts) || 0;
    totalAttempts += attempts;
    completionSum += Number(row.completion_rate) || 0;

    if (Number(row.avg_attempts_to_pass) > 0) {
      attemptsToPassSum += Number(row.avg_attempts_to_pass);
      attemptsToPassCount += 1;
    }
    if (attempts > 0) {
      durationSum += Number(row.avg_duration_seconds) || 0;
      durationCount += 1;
      hintSum += Number(row.avg_hint_level) || 0;
      hintCount += 1;
    }

    const failCount = Number(row.top_failed_assertion_count) || 0;
    if (
      failCount > 0 &&
      row.top_failed_assertion_label &&
      (!topBottleneck || failCount > topBottleneck.failCount)
    ) {
      topBottleneck = {
        lessonTitle: row.lesson_title,
        assertionLabel: row.top_failed_assertion_label,
        failCount,
      };
    }
  }

  return {
    totalLessons: rows.length,
    totalAttempts,
    avgCompletionRate: Math.round((completionSum / rows.length) * 10) / 10,
    avgAttemptsToPass:
      attemptsToPassCount > 0
        ? Math.round((attemptsToPassSum / attemptsToPassCount) * 100) / 100
        : 0,
    avgDurationSeconds:
      durationCount > 0 ? Math.round(durationSum / durationCount) : 0,
    avgHintLevel:
      hintCount > 0 ? Math.round((hintSum / hintCount) * 100) / 100 : 0,
    topBottleneck,
  };
}

export async function recordLearningAttempt(
  userId: string,
  input: RecordLearningAttemptInput,
  client: SupabaseClient<Database>,
): Promise<void> {
  await assertAuthenticatedUserMatches(
    userId,
    client,
    (message) => new Error(message),
  );

  const clampedDuration = Math.max(
    0,
    Math.min(86400, Math.round(input.durationSeconds)),
  );
  const clampedHint = Math.max(
    0,
    Math.min(3, Math.round(input.hintLevelUsed ?? 0)),
  );

  const { error } = await client.from("learning_lesson_attempts").insert({
    user_id: userId,
    lesson_id: input.lessonId,
    passed: input.passed,
    duration_seconds: clampedDuration,
    hint_level_used: clampedHint,
    failed_assertion_id: input.passed ? null : (input.failedAssertionId ?? null),
    failed_assertion_label: input.passed
      ? null
      : (input.failedAssertionLabel ?? null),
    runtime_target: input.runtimeTarget ?? "client_pyodide",
  });

  if (error) {
    throw new Error(
      mapSupabaseDatabaseError(error, {
        table: "learning_lesson_attempts",
        operation: "recordLearningAttempt",
        silent: true,
      }),
    );
  }
}

export async function fetchLearningRetentionAnalytics(
  client: SupabaseClient<Database>,
  trackSlug?: string | null,
): Promise<LearningAnalyticsPayload> {
  const { data, error } = await client.rpc("get_learning_retention_analytics", {
    p_track_slug: trackSlug ?? null,
  });

  if (error) {
    if (isMissingDatabaseSchemaError(error)) {
      return {
        rows: [],
        summary: summarizeLearningAnalytics([]),
        migrationMissing: true,
      };
    }

    throw new Error(
      mapSupabaseDatabaseError(error, {
        operation: "get_learning_retention_analytics",
      }),
    );
  }

  const rows: LearningRetentionAnalyticsRow[] = Array.isArray(data)
    ? data.map((row) => ({
        ...row,
        total_learners: Number(row.total_learners) || 0,
        completed_learners: Number(row.completed_learners) || 0,
        completion_rate: Number(row.completion_rate) || 0,
        total_attempts: Number(row.total_attempts) || 0,
        avg_attempts_to_pass: Number(row.avg_attempts_to_pass) || 0,
        avg_duration_seconds: Number(row.avg_duration_seconds) || 0,
        avg_hint_level: Number(row.avg_hint_level) || 0,
        max_hint_level_used: Number(row.max_hint_level_used) || 0,
        top_failed_assertion_count: Number(row.top_failed_assertion_count) || 0,
      }))
    : [];

  return {
    rows,
    summary: summarizeLearningAnalytics(rows),
    migrationMissing: false,
  };
}
