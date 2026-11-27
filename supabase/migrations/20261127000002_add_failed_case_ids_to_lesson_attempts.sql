-- ==============================================================================
-- Codit (TCC-Codit) — Migração Complementar Ultra (Chat 1): failed_case_ids
-- Adiciona coluna `failed_case_ids` em `public.exercise_submissions` e atualiza
-- `public.record_lesson_attempt` preservando compatibilidade com 7 argumentos.
-- ==============================================================================

ALTER TABLE public.exercise_submissions
  ADD COLUMN IF NOT EXISTS failed_case_ids TEXT[] NOT NULL DEFAULT '{}';

DROP FUNCTION IF EXISTS public.record_lesson_attempt(UUID, TEXT, BOOLEAN, INTEGER, INTEGER, INTEGER, SMALLINT);

CREATE OR REPLACE FUNCTION public.record_lesson_attempt(
  p_lesson_id UUID,
  p_code TEXT,
  p_passed BOOLEAN,
  p_passed_cases INTEGER,
  p_total_cases INTEGER,
  p_execution_ms INTEGER DEFAULT 0,
  p_hint_level_used SMALLINT DEFAULT 0,
  p_failed_case_ids TEXT[] DEFAULT '{}'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_lesson public.lessons%ROWTYPE;
  v_track public.tracks%ROWTYPE;
  v_progress public.user_lesson_progress%ROWTYPE;
  v_profile public.profiles%ROWTYPE;
  v_already_completed BOOLEAN := FALSE;
  v_effective_hint SMALLINT := LEAST(GREATEST(COALESCE(p_hint_level_used, 0), 0), 3);
  v_xp_earned INTEGER := 0;
  v_new_status VARCHAR(20);
  v_completed_at TIMESTAMPTZ;
  v_attempts_count INTEGER := 1;
  v_new_xp_total INTEGER := 0;
  v_new_streak INTEGER := 0;
  v_today DATE := (NOW() AT TIME ZONE 'UTC')::DATE;
  v_badges TEXT[] := '{}';
  v_new_badges TEXT[] := '{}';
  v_total_in_track INTEGER := 0;
  v_completed_in_track INTEGER := 0;
  v_track_badge TEXT;
  v_clean_failed_ids TEXT[] := COALESCE(p_failed_case_ids, '{}');
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Autenticação obrigatória para registrar tentativa.'
      USING ERRCODE = '42501';
  END IF;

  SELECT *
  INTO v_lesson
  FROM public.lessons
  WHERE id = p_lesson_id
    AND is_published = TRUE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lição não encontrada ou não publicada.'
      USING ERRCODE = 'P0002';
  END IF;

  SELECT *
  INTO v_track
  FROM public.tracks
  WHERE id = v_lesson.track_id;

  SELECT *
  INTO v_profile
  FROM public.profiles
  WHERE id = v_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Perfil do usuário não encontrado.'
      USING ERRCODE = 'P0002';
  END IF;

  SELECT *
  INTO v_progress
  FROM public.user_lesson_progress
  WHERE user_id = v_user_id
    AND lesson_id = p_lesson_id
  FOR UPDATE;

  IF FOUND AND v_progress.status = 'completed' THEN
    v_already_completed := TRUE;
  END IF;

  IF p_passed AND NOT v_already_completed THEN
    IF v_effective_hint >= 3 THEN
      v_xp_earned := GREATEST(1, FLOOR(v_lesson.xp_reward * 0.5)::INTEGER);
    ELSE
      v_xp_earned := v_lesson.xp_reward;
    END IF;
  END IF;

  INSERT INTO public.exercise_submissions (
    user_id,
    lesson_id,
    code,
    passed,
    passed_cases,
    total_cases,
    execution_ms,
    hint_level_used,
    xp_earned,
    failed_case_ids
  )
  VALUES (
    v_user_id,
    p_lesson_id,
    LEFT(COALESCE(p_code, ''), 50000),
    COALESCE(p_passed, FALSE),
    GREATEST(COALESCE(p_passed_cases, 0), 0),
    GREATEST(COALESCE(p_total_cases, 0), 0),
    GREATEST(COALESCE(p_execution_ms, 0), 0),
    v_effective_hint,
    v_xp_earned,
    v_clean_failed_ids
  );

  IF v_already_completed OR p_passed THEN
    v_new_status := 'completed';
    v_completed_at := COALESCE(v_progress.completed_at, NOW());
  ELSE
    v_new_status := 'in_progress';
    v_completed_at := NULL;
  END IF;

  IF v_progress.user_id IS NOT NULL THEN
    v_attempts_count := v_progress.attempts_count + 1;
    UPDATE public.user_lesson_progress
    SET
      status = v_new_status,
      best_code = CASE
        WHEN p_passed OR v_progress.best_code IS NULL THEN LEFT(COALESCE(p_code, ''), 50000)
        ELSE v_progress.best_code
      END,
      attempts_count = v_attempts_count,
      max_hint_level_used = GREATEST(v_progress.max_hint_level_used, v_effective_hint),
      xp_awarded = GREATEST(v_progress.xp_awarded, v_xp_earned),
      completed_at = v_completed_at,
      last_attempt_at = NOW(),
      updated_at = NOW()
    WHERE user_id = v_user_id
      AND lesson_id = p_lesson_id;
  ELSE
    v_attempts_count := 1;
    INSERT INTO public.user_lesson_progress (
      user_id,
      lesson_id,
      status,
      best_code,
      attempts_count,
      max_hint_level_used,
      xp_awarded,
      completed_at,
      last_attempt_at
    )
    VALUES (
      v_user_id,
      p_lesson_id,
      v_new_status,
      LEFT(COALESCE(p_code, ''), 50000),
      1,
      v_effective_hint,
      v_xp_earned,
      v_completed_at,
      NOW()
    );
  END IF;

  v_new_xp_total := COALESCE(v_profile.xp_total, 0) + v_xp_earned;
  v_new_streak := COALESCE(v_profile.current_streak, 0);
  v_badges := COALESCE(v_profile.badges, '{}');

  IF p_passed AND NOT v_already_completed THEN
    IF v_profile.last_activity_date IS NULL THEN
      v_new_streak := 1;
    ELSIF v_profile.last_activity_date = v_today THEN
      v_new_streak := GREATEST(v_new_streak, 1);
    ELSIF v_profile.last_activity_date = (v_today - INTERVAL '1 day')::DATE THEN
      v_new_streak := v_new_streak + 1;
    ELSE
      v_new_streak := 1;
    END IF;

    IF NOT ('first_lesson' = ANY(v_badges)) THEN
      v_badges := array_append(v_badges, 'first_lesson');
      v_new_badges := array_append(v_new_badges, 'first_lesson');
    END IF;

    IF v_effective_hint = 0 AND NOT ('no_hint_solver' = ANY(v_badges)) THEN
      v_badges := array_append(v_badges, 'no_hint_solver');
      v_new_badges := array_append(v_new_badges, 'no_hint_solver');
    END IF;

    IF v_new_streak >= 3 AND NOT ('streak_3' = ANY(v_badges)) THEN
      v_badges := array_append(v_badges, 'streak_3');
      v_new_badges := array_append(v_new_badges, 'streak_3');
    END IF;

    SELECT COUNT(*)
    INTO v_total_in_track
    FROM public.lessons
    WHERE track_id = v_lesson.track_id
      AND is_published = TRUE;

    SELECT COUNT(*)
    INTO v_completed_in_track
    FROM public.user_lesson_progress ulp
    JOIN public.lessons l ON l.id = ulp.lesson_id
    WHERE ulp.user_id = v_user_id
      AND ulp.status = 'completed'
      AND l.track_id = v_lesson.track_id
      AND l.is_published = TRUE;

    v_track_badge := CASE
      WHEN v_track.slug IN ('fundamentos-python', 'python-na-pratica') THEN 'python_fundamentals_complete'
      ELSE 'js_fundamentals_complete'
    END;

    IF v_total_in_track > 0
      AND v_completed_in_track >= v_total_in_track
      AND NOT (v_track_badge = ANY(v_badges))
    THEN
      v_badges := array_append(v_badges, v_track_badge);
      v_new_badges := array_append(v_new_badges, v_track_badge);
    END IF;

    UPDATE public.profiles
    SET
      xp_total = v_new_xp_total,
      current_streak = v_new_streak,
      last_activity_date = v_today,
      badges = v_badges,
      updated_at = NOW()
    WHERE id = v_user_id;
  END IF;

  RETURN jsonb_build_object(
    'status', v_new_status,
    'already_completed', v_already_completed,
    'xp_earned', v_xp_earned,
    'xp_total', v_new_xp_total,
    'current_streak', v_new_streak,
    'badges', to_jsonb(v_badges),
    'newly_unlocked_badges', to_jsonb(v_new_badges),
    'attempts_count', v_attempts_count,
    'completed_at', v_completed_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.record_lesson_attempt(UUID, TEXT, BOOLEAN, INTEGER, INTEGER, INTEGER, SMALLINT, TEXT[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_lesson_attempt(UUID, TEXT, BOOLEAN, INTEGER, INTEGER, INTEGER, SMALLINT, TEXT[]) TO authenticated;
