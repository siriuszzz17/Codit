-- ==============================================================================
-- Codit (TCC-Codit) — Fase 4: Observabilidade de Erros & Analytics de Aprendizado
-- ==============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ==============================================================================
-- 1. Tabela public.error_events (observabilidade leve front/API/worker)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.error_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID
    CONSTRAINT fk_error_events_user_id REFERENCES public.profiles(id) ON DELETE SET NULL,
  trace_id VARCHAR(80) NOT NULL,
  source VARCHAR(24) NOT NULL DEFAULT 'frontend'
    CONSTRAINT chk_error_events_source CHECK (source IN ('frontend', 'api', 'worker')),
  severity VARCHAR(16) NOT NULL DEFAULT 'error'
    CONSTRAINT chk_error_events_severity CHECK (severity IN ('warning', 'error', 'fatal')),
  title VARCHAR(160) NOT NULL,
  message TEXT NOT NULL
    CONSTRAINT chk_error_events_message CHECK (char_length(btrim(message)) BETWEEN 1 AND 2000),
  stack TEXT
    CONSTRAINT chk_error_events_stack CHECK (stack IS NULL OR char_length(stack) <= 4000),
  route VARCHAR(240),
  problem_type VARCHAR(160),
  status_code INTEGER,
  context_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_error_events_created
  ON public.error_events (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_error_events_user_created
  ON public.error_events (user_id, created_at DESC)
  WHERE user_id IS NOT NULL;

ALTER TABLE public.error_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS error_events_insert_authenticated ON public.error_events;
CREATE POLICY error_events_insert_authenticated
  ON public.error_events
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id IS NULL OR user_id = auth.uid());

DROP POLICY IF EXISTS error_events_insert_anon ON public.error_events;
CREATE POLICY error_events_insert_anon
  ON public.error_events
  FOR INSERT
  TO anon
  WITH CHECK (user_id IS NULL);

DROP POLICY IF EXISTS error_events_select_own ON public.error_events;
CREATE POLICY error_events_select_own
  ON public.error_events
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

REVOKE ALL ON TABLE public.error_events FROM PUBLIC, anon, authenticated;
GRANT INSERT ON TABLE public.error_events TO anon, authenticated;
GRANT SELECT ON TABLE public.error_events TO authenticated;

-- ==============================================================================
-- 2. RPC get_learning_analytics_summary() para métricas de aprendizado (TCC)
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.get_learning_analytics_summary()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_total_attempts INTEGER := 0;
  v_passed_attempts INTEGER := 0;
  v_total_execution_ms BIGINT := 0;
  v_avg_execution_ms INTEGER := 0;
  v_max_hint_level INTEGER := 0;
  v_total_lessons INTEGER := 0;
  v_completed_lessons INTEGER := 0;
  v_completion_rate INTEGER := 0;
  v_lessons_breakdown JSONB := '[]'::jsonb;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Autenticação obrigatória.'
      USING ERRCODE = '42501';
  END IF;

  SELECT
    COUNT(*)::INTEGER,
    COUNT(*) FILTER (WHERE es.passed)::INTEGER,
    COALESCE(SUM(es.execution_ms), 0)::BIGINT,
    COALESCE(ROUND(AVG(es.execution_ms)), 0)::INTEGER,
    COALESCE(MAX(es.hint_level_used), 0)::INTEGER
  INTO
    v_total_attempts,
    v_passed_attempts,
    v_total_execution_ms,
    v_avg_execution_ms,
    v_max_hint_level
  FROM public.exercise_submissions es
  WHERE es.user_id = v_actor;

  SELECT COUNT(*)::INTEGER
  INTO v_total_lessons
  FROM public.lessons l
  WHERE l.is_published = TRUE;

  SELECT COUNT(*)::INTEGER
  INTO v_completed_lessons
  FROM public.user_lesson_progress ulp
  WHERE ulp.user_id = v_actor
    AND ulp.status = 'completed';

  IF v_total_lessons > 0 THEN
    v_completion_rate := LEAST(100, ROUND((v_completed_lessons::NUMERIC / v_total_lessons::NUMERIC) * 100)::INTEGER);
  END IF;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'lesson_id', l.id,
        'slug', l.slug,
        'title', l.title,
        'status', COALESCE(ulp.status, 'not_started'),
        'attempts_count', COALESCE(ulp.attempts_count, 0),
        'max_hint_level_used', COALESCE(ulp.max_hint_level_used, 0),
        'total_execution_ms', COALESCE(sub_agg.total_ms, 0)
      )
      ORDER BY l.order_index ASC
    ),
    '[]'::jsonb
  )
  INTO v_lessons_breakdown
  FROM public.lessons l
  LEFT JOIN public.user_lesson_progress ulp
    ON ulp.lesson_id = l.id AND ulp.user_id = v_actor
  LEFT JOIN (
    SELECT
      es.lesson_id,
      COALESCE(SUM(es.execution_ms), 0)::BIGINT AS total_ms
    FROM public.exercise_submissions es
    WHERE es.user_id = v_actor
    GROUP BY es.lesson_id
  ) sub_agg ON sub_agg.lesson_id = l.id
  WHERE l.is_published = TRUE;

  RETURN jsonb_build_object(
    'total_attempts', v_total_attempts,
    'passed_attempts', v_passed_attempts,
    'total_execution_ms', v_total_execution_ms,
    'avg_execution_ms', v_avg_execution_ms,
    'max_hint_level_used', v_max_hint_level,
    'total_lessons', v_total_lessons,
    'completed_lessons', v_completed_lessons,
    'completion_rate_percent', v_completion_rate,
    'lessons', v_lessons_breakdown
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_learning_analytics_summary() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_learning_analytics_summary() TO authenticated;

NOTIFY pgrst, 'reload schema';
