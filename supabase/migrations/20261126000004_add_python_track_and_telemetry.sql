-- Fase 4: Trilha Python (Pyodide), Telemetria Sanitizada e Analytics de Aprendizado (TCC)
-- Regras: RN-003 (isolamento por user_id), RN-201/RN-202 (Pyodide WASM), Zero PII em client_error_logs

BEGIN;

-- 1. Catálogo mínimo idempotente de trilhas e lições (compatível com bancos com ou sem Fase 2)
CREATE TABLE IF NOT EXISTS public.tracks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug VARCHAR(80) NOT NULL UNIQUE,
  title VARCHAR(140) NOT NULL,
  description TEXT,
  category VARCHAR(40) NOT NULL DEFAULT 'programming',
  level VARCHAR(24) NOT NULL DEFAULT 'beginner',
  order_index INTEGER NOT NULL DEFAULT 0,
  is_published BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.tracks ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE public.tracks ADD COLUMN IF NOT EXISTS category VARCHAR(40) NOT NULL DEFAULT 'programming';
ALTER TABLE public.tracks ADD COLUMN IF NOT EXISTS level VARCHAR(24) NOT NULL DEFAULT 'beginner';
ALTER TABLE public.tracks ADD COLUMN IF NOT EXISTS order_index INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.tracks ADD COLUMN IF NOT EXISTS is_published BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE public.tracks ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE public.tracks ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE TABLE IF NOT EXISTS public.lessons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  track_id UUID REFERENCES public.tracks(id) ON DELETE CASCADE,
  slug VARCHAR(100) NOT NULL UNIQUE,
  title VARCHAR(160) NOT NULL,
  language VARCHAR(30) NOT NULL DEFAULT 'python',
  starter_code TEXT NOT NULL DEFAULT '',
  assertions_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  estimated_minutes SMALLINT NOT NULL DEFAULT 10,
  order_index INTEGER NOT NULL DEFAULT 0,
  is_published BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.lessons ADD COLUMN IF NOT EXISTS track_id UUID REFERENCES public.tracks(id) ON DELETE CASCADE;
ALTER TABLE public.lessons ADD COLUMN IF NOT EXISTS language VARCHAR(30) NOT NULL DEFAULT 'python';
ALTER TABLE public.lessons ADD COLUMN IF NOT EXISTS starter_code TEXT NOT NULL DEFAULT '';
ALTER TABLE public.lessons ADD COLUMN IF NOT EXISTS assertions_json JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.lessons ADD COLUMN IF NOT EXISTS estimated_minutes SMALLINT NOT NULL DEFAULT 10;
ALTER TABLE public.lessons ADD COLUMN IF NOT EXISTS order_index INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.lessons ADD COLUMN IF NOT EXISTS is_published BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE public.lessons ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE public.lessons ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_lessons_track_order
  ON public.lessons (track_id, order_index);

-- 2. Telemetria sanitizada de erros (Zero PII, throttle client-side 5/sessão)
CREATE TABLE IF NOT EXISTS public.client_error_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  trace_id VARCHAR(80) NOT NULL,
  source VARCHAR(40) NOT NULL,
  error_type VARCHAR(120) NOT NULL,
  message VARCHAR(300) NOT NULL,
  status_code SMALLINT,
  route VARCHAR(160) NOT NULL DEFAULT '/',
  app_version VARCHAR(32) NOT NULL DEFAULT '0.0.0',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_client_error_logs_source CHECK (
    source IN ('window_error', 'unhandled_rejection', 'problem_details', 'pyodide_worker', 'manual')
  ),
  CONSTRAINT chk_client_error_logs_metadata_object CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE INDEX IF NOT EXISTS idx_client_error_logs_created_at
  ON public.client_error_logs (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_client_error_logs_user_created
  ON public.client_error_logs (user_id, created_at DESC);

-- 3. Tentativas e analytics de aprendizado por lição (isolado por user_id)
CREATE TABLE IF NOT EXISTS public.learning_lesson_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  lesson_id UUID NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
  passed BOOLEAN NOT NULL DEFAULT FALSE,
  duration_seconds INTEGER NOT NULL DEFAULT 0,
  hint_level_used SMALLINT NOT NULL DEFAULT 0,
  failed_assertion_id VARCHAR(80),
  failed_assertion_label VARCHAR(180),
  runtime_target VARCHAR(30) NOT NULL DEFAULT 'client_pyodide',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_learning_attempts_duration CHECK (duration_seconds >= 0 AND duration_seconds <= 86400),
  CONSTRAINT chk_learning_attempts_hint_level CHECK (hint_level_used BETWEEN 0 AND 3),
  CONSTRAINT chk_learning_attempts_runtime CHECK (
    runtime_target IN ('client_iframe', 'client_pyodide', 'remote_judge0', 'remote_piston')
  )
);

CREATE INDEX IF NOT EXISTS idx_learning_attempts_user_lesson
  ON public.learning_lesson_attempts (user_id, lesson_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_learning_attempts_lesson_failed
  ON public.learning_lesson_attempts (lesson_id, failed_assertion_id)
  WHERE passed = FALSE AND failed_assertion_id IS NOT NULL;

-- 4. RLS e Grants de menor privilégio
ALTER TABLE public.tracks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lessons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_error_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.learning_lesson_attempts ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.tracks FROM anon, authenticated;
REVOKE ALL ON TABLE public.lessons FROM anon, authenticated;
REVOKE ALL ON TABLE public.client_error_logs FROM anon, authenticated;
REVOKE ALL ON TABLE public.learning_lesson_attempts FROM anon, authenticated;

GRANT SELECT ON TABLE public.tracks TO anon, authenticated;
GRANT SELECT ON TABLE public.lessons TO anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.client_error_logs TO authenticated;
GRANT SELECT, INSERT ON TABLE public.learning_lesson_attempts TO authenticated;

DROP POLICY IF EXISTS tracks_select_published ON public.tracks;
CREATE POLICY tracks_select_published
  ON public.tracks
  FOR SELECT
  TO anon, authenticated
  USING (is_published = TRUE);

DROP POLICY IF EXISTS lessons_select_published ON public.lessons;
CREATE POLICY lessons_select_published
  ON public.lessons
  FOR SELECT
  TO anon, authenticated
  USING (is_published = TRUE);

DROP POLICY IF EXISTS client_error_logs_insert_own ON public.client_error_logs;
CREATE POLICY client_error_logs_insert_own
  ON public.client_error_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS client_error_logs_select_own ON public.client_error_logs;
CREATE POLICY client_error_logs_select_own
  ON public.client_error_logs
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS learning_lesson_attempts_select_own ON public.learning_lesson_attempts;
CREATE POLICY learning_lesson_attempts_select_own
  ON public.learning_lesson_attempts
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS learning_lesson_attempts_insert_own ON public.learning_lesson_attempts;
CREATE POLICY learning_lesson_attempts_insert_own
  ON public.learning_lesson_attempts
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- 5. Seed idempotente da trilha Python (Pyodide), compatível com qualquer schema existente de tracks/lessons
DO $$
DECLARE
  v_track_id UUID;
  v_module_id UUID;
  v_has_modules BOOLEAN;
  v_has_module_id BOOLEAN;
  v_cols TEXT := 'track_id, slug, title, language, starter_code, assertions_json, estimated_minutes, order_index, is_published';
  v_vals TEXT := '$1, $2, $3, ''python'', $4, $5::jsonb, $6, $7, TRUE';
  v_extra_col RECORD;
  v_lesson RECORD;
BEGIN
  INSERT INTO public.tracks (slug, title, description, category, level, order_index, is_published)
  VALUES (
    'python-fundamentos',
    'Python na Prática com Pyodide',
    'Execute código Python diretamente no navegador via WebAssembly (Pyodide Worker) com validação automática de critérios.',
    'programming',
    'beginner',
    10,
    TRUE
  )
  ON CONFLICT (slug) DO NOTHING;

  SELECT id INTO v_track_id
  FROM public.tracks
  WHERE slug = 'python-fundamentos'
  LIMIT 1;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'modules'
  ) INTO v_has_modules;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'lessons' AND column_name = 'module_id'
  ) INTO v_has_module_id;

  IF v_has_modules AND v_has_module_id THEN
    EXECUTE $sql$
      UPDATE public.lessons l
      SET track_id = m.track_id
      FROM public.modules m
      WHERE l.module_id = m.id AND l.track_id IS NULL
    $sql$;

    EXECUTE $sql$
      INSERT INTO public.modules (track_id, slug, title, order_index)
      VALUES ($1, 'python-fundamentos-mod-1', 'Fundamentos em Python', 1)
      ON CONFLICT (slug) DO NOTHING
    $sql$ USING v_track_id;

    EXECUTE $sql$
      SELECT id FROM public.modules WHERE slug = 'python-fundamentos-mod-1' LIMIT 1
    $sql$ INTO v_module_id;
  END IF;

  IF v_has_module_id AND v_module_id IS NOT NULL THEN
    v_cols := v_cols || ', module_id';
    v_vals := v_vals || ', $12';
  END IF;

  -- Mapeia colunas opcionais conhecidas de schemas da Fase 2 (summary, content_md, content_markdown, solution_code, validation_rules, static_hints)
  FOR v_extra_col IN
    SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'lessons'
      AND column_name NOT IN (
        'id', 'track_id', 'module_id', 'slug', 'title', 'language',
        'starter_code', 'assertions_json', 'estimated_minutes',
        'order_index', 'is_published', 'created_at', 'updated_at'
      )
  LOOP
    IF v_extra_col.column_name = 'summary' THEN
      v_cols := v_cols || ', summary';
      v_vals := v_vals || ', $8';
    ELSIF v_extra_col.column_name IN ('content_md', 'content_markdown') THEN
      v_cols := v_cols || ', ' || quote_ident(v_extra_col.column_name);
      v_vals := v_vals || ', $9';
    ELSIF v_extra_col.column_name = 'solution_code' THEN
      v_cols := v_cols || ', solution_code';
      v_vals := v_vals || ', $10';
    ELSIF v_extra_col.column_name = 'validation_rules' AND v_extra_col.data_type IN ('json', 'jsonb') THEN
      v_cols := v_cols || ', validation_rules';
      v_vals := v_vals || ', $5::jsonb';
    ELSIF v_extra_col.column_name = 'static_hints' AND v_extra_col.data_type IN ('json', 'jsonb') THEN
      v_cols := v_cols || ', static_hints';
      v_vals := v_vals || ', $11::jsonb';
    ELSIF v_extra_col.is_nullable = 'NO' AND v_extra_col.column_default IS NULL THEN
      IF v_extra_col.data_type IN ('text', 'character varying', 'character') THEN
        v_cols := v_cols || ', ' || quote_ident(v_extra_col.column_name);
        v_vals := v_vals || ', ''''';
      ELSIF v_extra_col.data_type IN ('integer', 'smallint', 'bigint', 'numeric') THEN
        v_cols := v_cols || ', ' || quote_ident(v_extra_col.column_name);
        v_vals := v_vals || ', 0';
      ELSIF v_extra_col.data_type = 'boolean' THEN
        v_cols := v_cols || ', ' || quote_ident(v_extra_col.column_name);
        v_vals := v_vals || ', FALSE';
      ELSIF v_extra_col.data_type IN ('json', 'jsonb') THEN
        v_cols := v_cols || ', ' || quote_ident(v_extra_col.column_name);
        v_vals := v_vals || ', ''[]''::jsonb';
      END IF;
    END IF;
  END LOOP;

  FOR v_lesson IN
    SELECT *
    FROM (
      VALUES
        (
          'python-variaveis-e-print',
          'Variáveis, Tipos e Saída no Console',
          E'nome = "Codit"\nidade = 20\nprint(f"Olá, {nome}!")\n',
          '[{"id":"var-nome","label":"Variável nome deve ser string não vazia","expression":"isinstance(nome, str) and len(nome.strip()) > 0"},{"id":"var-idade","label":"Variável idade deve ser inteiro positivo","expression":"isinstance(idade, int) and idade > 0"}]',
          8,
          1,
          'Declare variáveis tipadas em Python e imprima saída formatada no Web Worker Pyodide.',
          E'## Variáveis e Tipos em Python\n\nDefina `nome` (string não vazia) e `idade` (inteiro positivo) e imprima uma saudação com `print(...)`.',
          E'nome = "Codit"\nidade = 20\nprint(f"Olá, {nome}! Idade: {idade}")\n',
          '["Use aspas para criar strings em Python.","Certifique-se de que idade seja um número inteiro maior que zero.","Use f-string: print(f\"Olá, {nome}!\")."]'
        ),
        (
          'python-listas-e-medias',
          'Listas e Cálculo de Média',
          E'def calcular_media(notas):\n    return sum(notas) / len(notas)\n\nmedia = calcular_media([8.0, 9.0, 10.0])\nprint(f"Média: {media:.2f}")\n',
          '[{"id":"fn-calcular-media","label":"Função calcular_media definida","expression":"callable(calcular_media)"},{"id":"media-correta","label":"calcular_media([8, 9, 10]) == 9.0","expression":"abs(calcular_media([8, 9, 10]) - 9.0) < 1e-6"}]',
          12,
          2,
          'Calcule a média aritmética de uma lista de notas usando sum() e len().',
          E'## Listas e Funções Nativas\n\nImplemente `calcular_media(notas)` retornando a soma dividida pela quantidade de elementos.',
          E'def calcular_media(notas):\n    return sum(notas) / len(notas)\n\nmedia = calcular_media([8.0, 9.0, 10.0])\nprint(f"Média: {media:.2f}")\n',
          '["A função sum(notas) soma todos os números da lista.","A função len(notas) retorna quantos itens existem na lista.","Retorne sum(notas) / len(notas)."]'
        ),
        (
          'python-funcoes-e-condicionais',
          'Funções e Condicionais de Aprovação',
          E'def verificar_status(nota):\n    if nota >= 7.0:\n        return "aprovado"\n    return "revisar"\n\nprint(verificar_status(8.5))\n',
          '[{"id":"status-aprovado","label":"verificar_status(7.5) retorna aprovado","expression":"verificar_status(7.5) == ''aprovado''"},{"id":"status-revisar","label":"verificar_status(5.0) retorna revisar","expression":"verificar_status(5.0) == ''revisar''"}]',
          15,
          3,
          'Crie uma função condicional em Python para classificar notas de alunos.',
          E'## Condicionais em Python\n\nImplemente `verificar_status(nota)` retornando `"aprovado"` para `nota >= 7.0` e `"revisar"` caso contrário.',
          E'def verificar_status(nota):\n    if nota >= 7.0:\n        return "aprovado"\n    return "revisar"\n\nprint(verificar_status(8.5))\n',
          '["Compare a nota usando >= 7.0.","Retorne exatamente as strings \"aprovado\" ou \"revisar\" em minúsculas.","Teste ambos os caminhos com notas acima e abaixo de 7.0."]'
        )
    ) AS t(
      slug, title, starter_code, assertions_json, estimated_minutes,
      order_index, summary, content_md, solution_code, static_hints
    )
  LOOP
    EXECUTE
      format('INSERT INTO public.lessons (%s) VALUES (%s) ON CONFLICT (slug) DO NOTHING', v_cols, v_vals)
    USING
      v_track_id,
      v_lesson.slug,
      v_lesson.title,
      v_lesson.starter_code,
      v_lesson.assertions_json,
      v_lesson.estimated_minutes,
      v_lesson.order_index,
      v_lesson.summary,
      v_lesson.content_md,
      v_lesson.solution_code,
      v_lesson.static_hints,
      v_module_id;
  END LOOP;
END;
$$;

-- 6. RPC de Analytics de Retenção e Aprendizado para o TCC (anti-IDOR: aluno vê só seus dados; admin vê agregado anônimo)
CREATE OR REPLACE FUNCTION public.get_learning_retention_analytics(
  p_track_slug TEXT DEFAULT NULL
)
RETURNS TABLE (
  track_slug VARCHAR(80),
  track_title VARCHAR(140),
  lesson_id UUID,
  lesson_slug VARCHAR(100),
  lesson_title VARCHAR(160),
  order_index INTEGER,
  total_learners BIGINT,
  completed_learners BIGINT,
  completion_rate NUMERIC(5, 2),
  total_attempts BIGINT,
  avg_attempts_to_pass NUMERIC(6, 2),
  avg_duration_seconds NUMERIC(8, 2),
  avg_hint_level NUMERIC(4, 2),
  max_hint_level_used SMALLINT,
  top_failed_assertion_id VARCHAR(80),
  top_failed_assertion_label VARCHAR(180),
  top_failed_assertion_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_is_admin BOOLEAN := FALSE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE = '42501';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = v_uid
      AND p.role = 'admin'
  )
  INTO v_is_admin;

  RETURN QUERY
  WITH scoped_attempts AS (
    SELECT a.*
    FROM public.learning_lesson_attempts a
    WHERE v_is_admin OR a.user_id = v_uid
  ),
  per_user_lesson AS (
    SELECT
      sa.lesson_id,
      sa.user_id,
      COUNT(*)::BIGINT AS attempts_count,
      BOOL_OR(sa.passed) AS has_passed
    FROM scoped_attempts sa
    GROUP BY sa.lesson_id, sa.user_id
  ),
  lesson_stats AS (
    SELECT
      pul.lesson_id,
      COUNT(*)::BIGINT AS total_learners,
      COUNT(*) FILTER (WHERE pul.has_passed)::BIGINT AS completed_learners,
      COALESCE(
        ROUND(
          AVG(pul.attempts_count) FILTER (WHERE pul.has_passed)::NUMERIC,
          2
        ),
        0::NUMERIC
      ) AS avg_attempts_to_pass
    FROM per_user_lesson pul
    GROUP BY pul.lesson_id
  ),
  attempt_averages AS (
    SELECT
      sa.lesson_id,
      COUNT(*)::BIGINT AS total_attempts,
      COALESCE(ROUND(AVG(sa.duration_seconds)::NUMERIC, 2), 0::NUMERIC) AS avg_duration_seconds,
      COALESCE(ROUND(AVG(sa.hint_level_used)::NUMERIC, 2), 0::NUMERIC) AS avg_hint_level,
      COALESCE(MAX(sa.hint_level_used), 0::SMALLINT) AS max_hint_level_used
    FROM scoped_attempts sa
    GROUP BY sa.lesson_id
  ),
  failed_assertions AS (
    SELECT
      sa.lesson_id,
      sa.failed_assertion_id,
      MAX(sa.failed_assertion_label) AS failed_assertion_label,
      COUNT(*)::BIGINT AS fail_count,
      ROW_NUMBER() OVER (
        PARTITION BY sa.lesson_id
        ORDER BY COUNT(*) DESC, sa.failed_assertion_id ASC
      ) AS rn
    FROM scoped_attempts sa
    WHERE sa.passed = FALSE
      AND sa.failed_assertion_id IS NOT NULL
    GROUP BY sa.lesson_id, sa.failed_assertion_id
  )
  SELECT
    t.slug::VARCHAR(80) AS track_slug,
    t.title::VARCHAR(140) AS track_title,
    l.id AS lesson_id,
    l.slug::VARCHAR(100) AS lesson_slug,
    l.title::VARCHAR(160) AS lesson_title,
    l.order_index::INTEGER,
    COALESCE(ls.total_learners, 0::BIGINT) AS total_learners,
    COALESCE(ls.completed_learners, 0::BIGINT) AS completed_learners,
    CASE
      WHEN COALESCE(ls.total_learners, 0) > 0 THEN
        ROUND((ls.completed_learners::NUMERIC / ls.total_learners::NUMERIC) * 100, 2)
      ELSE 0::NUMERIC(5, 2)
    END AS completion_rate,
    COALESCE(aa.total_attempts, 0::BIGINT) AS total_attempts,
    COALESCE(ls.avg_attempts_to_pass, 0::NUMERIC(6, 2)) AS avg_attempts_to_pass,
    COALESCE(aa.avg_duration_seconds, 0::NUMERIC(8, 2)) AS avg_duration_seconds,
    COALESCE(aa.avg_hint_level, 0::NUMERIC(4, 2)) AS avg_hint_level,
    COALESCE(aa.max_hint_level_used, 0::SMALLINT) AS max_hint_level_used,
    fa.failed_assertion_id AS top_failed_assertion_id,
    fa.failed_assertion_label AS top_failed_assertion_label,
    COALESCE(fa.fail_count, 0::BIGINT) AS top_failed_assertion_count
  FROM public.lessons l
  INNER JOIN public.tracks t ON t.id = l.track_id
  LEFT JOIN lesson_stats ls ON ls.lesson_id = l.id
  LEFT JOIN attempt_averages aa ON aa.lesson_id = l.id
  LEFT JOIN failed_assertions fa ON fa.lesson_id = l.id AND fa.rn = 1
  WHERE t.is_published = TRUE
    AND l.is_published = TRUE
    AND (p_track_slug IS NULL OR t.slug = p_track_slug)
  ORDER BY t.order_index ASC, l.order_index ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_learning_retention_analytics(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_learning_retention_analytics(TEXT) TO authenticated;

COMMIT;
