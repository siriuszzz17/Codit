import { requireSupabaseClient, type CoditSupabaseClient } from "@/lib/supabase/client";
import type {
  LessonProgressStatus,
  LessonRow,
  RecordLessonAttemptRpcResult,
  TrackRow,
  UserLessonProgressRow,
} from "@/lib/supabase/database.types";
import {
  isMissingDatabaseSchemaError,
  mapSupabaseDatabaseError,
} from "@/lib/supabase/errors";
import {
  assertAuthenticatedUserMatches,
  assertHasAuthenticatedSession,
} from "@/lib/supabase/session-guard";
import {
  lessonSlugSchema,
  normalizeLessonHints,
  normalizeLessonTestCases,
  recordLessonAttemptInputSchema,
  type LessonHint,
  type LessonTestCase,
  type RecordLessonAttemptInput,
} from "@/modules/learning/learning-schemas";

export interface NormalizedLesson extends Omit<LessonRow, "hints" | "test_cases"> {
  hints: LessonHint[];
  test_cases: LessonTestCase[];
}

export interface LessonWithProgress {
  lesson: NormalizedLesson;
  progress: UserLessonProgressRow | null;
  status: LessonProgressStatus;
}

export interface TrackWithLessonsAndProgress {
  track: TrackRow;
  lessons: LessonWithProgress[];
  completedCount: number;
  totalCount: number;
  percentComplete: number;
  totalXpAvailable: number;
}

export interface LessonDetailBundle {
  track: TrackRow;
  lesson: NormalizedLesson;
  progress: UserLessonProgressRow | null;
  siblings: LessonWithProgress[];
  previousLessonSlug: string | null;
  nextLessonSlug: string | null;
}

export class LearningServiceError extends Error {
  readonly isMigrationMissing: boolean;

  constructor(message: string, isMigrationMissing = false) {
    super(message);
    this.name = "LearningServiceError";
    this.isMigrationMissing = isMigrationMissing;
  }
}

export function normalizeLessonRow(row: LessonRow): NormalizedLesson {
  return {
    ...row,
    hints: normalizeLessonHints(row.hints),
    test_cases: normalizeLessonTestCases(row.test_cases),
  };
}

export function computeTrackProgressSummary(
  lessons: readonly LessonWithProgress[],
): {
  completedCount: number;
  totalCount: number;
  percentComplete: number;
  totalXpAvailable: number;
} {
  const totalCount = lessons.length;
  const completedCount = lessons.filter((item) => item.status === "completed").length;
  const percentComplete =
    totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
  const totalXpAvailable = lessons.reduce(
    (sum, item) => sum + item.lesson.xp_reward,
    0,
  );
  return {
    completedCount,
    totalCount,
    percentComplete,
    totalXpAvailable,
  };
}

export async function listPublishedTracksWithProgress(
  userId: string | null,
  client?: CoditSupabaseClient,
): Promise<TrackWithLessonsAndProgress[]> {
  const supabase = client ?? requireSupabaseClient();

  const { data: tracksData, error: tracksError } = await supabase
    .from("tracks")
    .select("*")
    .eq("is_published", true)
    .order("order_index", { ascending: true });

  if (tracksError) {
    const missing = isMissingDatabaseSchemaError(tracksError);
    throw new LearningServiceError(
      mapSupabaseDatabaseError(tracksError, {
        table: "tracks",
        operation: "learning.listTracks",
        silent: missing,
      }),
      missing,
    );
  }

  const tracks = (tracksData ?? []) as TrackRow[];
  if (tracks.length === 0) {
    return [];
  }

  const trackIds = tracks.map((t) => t.id);

  const { data: lessonsData, error: lessonsError } = await supabase
    .from("lessons")
    .select("*")
    .in("track_id", trackIds)
    .eq("is_published", true)
    .order("order_index", { ascending: true });

  if (lessonsError) {
    const missing = isMissingDatabaseSchemaError(lessonsError);
    throw new LearningServiceError(
      mapSupabaseDatabaseError(lessonsError, {
        table: "lessons",
        operation: "learning.listLessons",
        silent: missing,
      }),
      missing,
    );
  }

  const normalizedLessons = ((lessonsData ?? []) as LessonRow[]).map(
    normalizeLessonRow,
  );

  const progressByLessonId = new Map<string, UserLessonProgressRow>();
  if (userId && normalizedLessons.length > 0) {
    const { data: progressData, error: progressError } = await supabase
      .from("user_lesson_progress")
      .select("*")
      .eq("user_id", userId);

    if (progressError) {
      const missing = isMissingDatabaseSchemaError(progressError);
      if (!missing) {
        mapSupabaseDatabaseError(progressError, {
          table: "user_lesson_progress",
          operation: "learning.listProgress",
        });
      }
    } else {
      for (const row of (progressData ?? []) as UserLessonProgressRow[]) {
        progressByLessonId.set(row.lesson_id, row);
      }
    }
  }

  return tracks.map((track) => {
    const trackLessons: LessonWithProgress[] = normalizedLessons
      .filter((lesson) => lesson.track_id === track.id)
      .sort((a, b) => a.order_index - b.order_index)
      .map((lesson) => {
        const progress = progressByLessonId.get(lesson.id) ?? null;
        return {
          lesson,
          progress,
          status: progress?.status ?? "not_started",
        };
      });

    const summary = computeTrackProgressSummary(trackLessons);
    return {
      track,
      lessons: trackLessons,
      ...summary,
    };
  });
}

export async function getLessonBySlug(
  rawSlug: string,
  userId: string | null,
  client?: CoditSupabaseClient,
): Promise<LessonDetailBundle | null> {
  const parsedSlug = lessonSlugSchema.safeParse(rawSlug);
  if (!parsedSlug.success) {
    return null;
  }

  const supabase = client ?? requireSupabaseClient();

  const { data: lessonData, error: lessonError } = await supabase
    .from("lessons")
    .select("*")
    .eq("slug", parsedSlug.data)
    .eq("is_published", true)
    .maybeSingle();

  if (lessonError) {
    const missing = isMissingDatabaseSchemaError(lessonError);
    throw new LearningServiceError(
      mapSupabaseDatabaseError(lessonError, {
        table: "lessons",
        operation: "learning.getLessonBySlug",
        silent: missing,
      }),
      missing,
    );
  }

  if (!lessonData) {
    return null;
  }

  const lesson = normalizeLessonRow(lessonData as LessonRow);

  const [{ data: trackData, error: trackError }, { data: siblingsData }] =
    await Promise.all([
      supabase
        .from("tracks")
        .select("*")
        .eq("id", lesson.track_id)
        .eq("is_published", true)
        .maybeSingle(),
      supabase
        .from("lessons")
        .select("*")
        .eq("track_id", lesson.track_id)
        .eq("is_published", true)
        .order("order_index", { ascending: true }),
    ]);

  if (trackError || !trackData) {
    if (trackError) {
      throw new LearningServiceError(
        mapSupabaseDatabaseError(trackError, {
          table: "tracks",
          operation: "learning.getLessonTrack",
        }),
        isMissingDatabaseSchemaError(trackError),
      );
    }
    return null;
  }

  const siblingLessons = ((siblingsData ?? []) as LessonRow[])
    .map(normalizeLessonRow)
    .sort((a, b) => a.order_index - b.order_index);

  const progressMap = new Map<string, UserLessonProgressRow>();
  if (userId) {
    const { data: progressData } = await supabase
      .from("user_lesson_progress")
      .select("*")
      .eq("user_id", userId);
    for (const row of (progressData ?? []) as UserLessonProgressRow[]) {
      progressMap.set(row.lesson_id, row);
    }
  }

  const siblings: LessonWithProgress[] = siblingLessons.map((item) => {
    const prog = progressMap.get(item.id) ?? null;
    return {
      lesson: item,
      progress: prog,
      status: prog?.status ?? "not_started",
    };
  });

  const currentIdx = siblings.findIndex((item) => item.lesson.id === lesson.id);
  const previousLessonSlug =
    currentIdx > 0 ? (siblings[currentIdx - 1]?.lesson.slug ?? null) : null;
  const nextLessonSlug =
    currentIdx >= 0 && currentIdx < siblings.length - 1
      ? (siblings[currentIdx + 1]?.lesson.slug ?? null)
      : null;

  return {
    track: trackData as TrackRow,
    lesson,
    progress: progressMap.get(lesson.id) ?? null,
    siblings,
    previousLessonSlug,
    nextLessonSlug,
  };
}

export async function recordLessonAttempt(
  input: RecordLessonAttemptInput,
  client?: CoditSupabaseClient,
): Promise<RecordLessonAttemptRpcResult> {
  const parsed = recordLessonAttemptInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new LearningServiceError(
      parsed.error.issues[0]?.message ?? "Dados da tentativa inválidos.",
    );
  }

  const supabase = client ?? requireSupabaseClient();
  await assertHasAuthenticatedSession(
    supabase,
    (message) => new LearningServiceError(message),
  );

  const { data, error } = await supabase.rpc("record_lesson_attempt", {
    p_lesson_id: parsed.data.lessonId,
    p_code: parsed.data.code,
    p_passed: parsed.data.passed,
    p_passed_cases: parsed.data.passedCases,
    p_total_cases: parsed.data.totalCases,
    p_execution_ms: parsed.data.executionMs,
    p_hint_level_used: parsed.data.hintLevelUsed,
  });

  if (error) {
    const missing = isMissingDatabaseSchemaError(error);
    throw new LearningServiceError(
      mapSupabaseDatabaseError(error, {
        table: "user_lesson_progress",
        operation: "learning.recordLessonAttempt",
      }),
      missing,
    );
  }

  const raw = (data ?? {}) as Partial<RecordLessonAttemptRpcResult>;
  return {
    status: raw.status ?? (parsed.data.passed ? "completed" : "in_progress"),
    already_completed: Boolean(raw.already_completed),
    xp_earned: typeof raw.xp_earned === "number" ? raw.xp_earned : 0,
    xp_total: typeof raw.xp_total === "number" ? raw.xp_total : 0,
    current_streak:
      typeof raw.current_streak === "number" ? raw.current_streak : 0,
    badges: Array.isArray(raw.badges) ? raw.badges : [],
    newly_unlocked_badges: Array.isArray(raw.newly_unlocked_badges)
      ? raw.newly_unlocked_badges
      : [],
    attempts_count:
      typeof raw.attempts_count === "number" ? raw.attempts_count : 1,
    completed_at: raw.completed_at ?? null,
  };
}

export async function markOnboardingCompleted(
  userId: string,
  client?: CoditSupabaseClient,
): Promise<void> {
  const supabase = client ?? requireSupabaseClient();
  await assertAuthenticatedUserMatches(
    userId,
    supabase,
    (message) => new LearningServiceError(message),
  );

  const { error } = await supabase
    .from("profiles")
    .update({
      onboarding_completed_at: new Date().toISOString(),
    })
    .eq("id", userId);

  if (error) {
    const missing = isMissingDatabaseSchemaError(error);
    throw new LearningServiceError(
      mapSupabaseDatabaseError(error, {
        table: "profiles",
        operation: "learning.markOnboardingCompleted",
      }),
      missing,
    );
  }
}
