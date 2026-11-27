-- ==============================================================================
-- Codit (TCC-Codit) — Fase 2: Núcleo Educacional MVP, Octopy & Gamificação
-- Tabelas: tracks, lessons, user_lesson_progress, exercise_submissions
-- Gamificação em profiles + espelho não-PII em public_profiles
-- RPC atômica: record_lesson_attempt (XP, streak, badges, progresso monotônico RN-102)
-- Seed idempotente: 1 trilha JavaScript com 5 lições progressivas
-- ==============================================================================

-- 1. Colunas de gamificação e onboarding em public.profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS xp_total INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS current_streak INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_activity_date DATE,
  ADD COLUMN IF NOT EXISTS badges TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS onboarding_completed_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_profiles_xp_total_non_negative'
      AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT chk_profiles_xp_total_non_negative CHECK (xp_total >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_profiles_current_streak_non_negative'
      AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT chk_profiles_current_streak_non_negative CHECK (current_streak >= 0);
  END IF;
END
$$;

-- 2. Espelho não-PII de gamificação em public.public_profiles
ALTER TABLE public.public_profiles
  ADD COLUMN IF NOT EXISTS xp_total INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS current_streak INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS badges TEXT[] NOT NULL DEFAULT '{}';

-- Atualiza trigger sync_public_profile para espelhar também xp_total, current_streak e badges
CREATE OR REPLACE FUNCTION public.sync_public_profile()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.public_profiles (
    id,
    username,
    full_name,
    avatar_url,
    bio,
    github_username,
    headline,
    location,
    website_url,
    linkedin_url,
    banner_preset,
    accent_theme,
    avatar_frame,
    octopy_companion,
    skills,
    xp_total,
    current_streak,
    badges,
    created_at,
    updated_at
  )
  VALUES (
    NEW.id,
    NEW.username,
    NEW.full_name,
    NEW.avatar_url,
    NEW.bio,
    NEW.github_username,
    NEW.headline,
    NEW.location,
    NEW.website_url,
    NEW.linkedin_url,
    COALESCE(NEW.banner_preset, 'nebula'),
    COALESCE(NEW.accent_theme, 'violet'),
    COALESCE(NEW.avatar_frame, 'glow'),
    COALESCE(NEW.octopy_companion, 'coding'),
    COALESCE(NEW.skills, '{}'),
    COALESCE(NEW.xp_total, 0),
    COALESCE(NEW.current_streak, 0),
    COALESCE(NEW.badges, '{}'),
    NEW.created_at,
    NEW.updated_at
  )
  ON CONFLICT (id) DO UPDATE SET
    username = EXCLUDED.username,
    full_name = EXCLUDED.full_name,
    avatar_url = EXCLUDED.avatar_url,
    bio = EXCLUDED.bio,
    github_username = EXCLUDED.github_username,
    headline = EXCLUDED.headline,
    location = EXCLUDED.location,
    website_url = EXCLUDED.website_url,
    linkedin_url = EXCLUDED.linkedin_url,
    banner_preset = EXCLUDED.banner_preset,
    accent_theme = EXCLUDED.accent_theme,
    avatar_frame = EXCLUDED.avatar_frame,
    octopy_companion = EXCLUDED.octopy_companion,
    skills = EXCLUDED.skills,
    xp_total = EXCLUDED.xp_total,
    current_streak = EXCLUDED.current_streak,
    badges = EXCLUDED.badges,
    updated_at = EXCLUDED.updated_at;

  RETURN NEW;
END;
$$;

-- Backfill de gamificação em public_profiles
UPDATE public.public_profiles pp
SET
  xp_total = COALESCE(p.xp_total, 0),
  current_streak = COALESCE(p.current_streak, 0),
  badges = COALESCE(p.badges, '{}')
FROM public.profiles p
WHERE pp.id = p.id;

-- 3. Tabela public.tracks
CREATE TABLE IF NOT EXISTS public.tracks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug VARCHAR(80) NOT NULL UNIQUE,
  title VARCHAR(140) NOT NULL,
  description TEXT NOT NULL,
  difficulty VARCHAR(24) NOT NULL DEFAULT 'beginner',
  language VARCHAR(32) NOT NULL DEFAULT 'javascript',
  estimated_minutes INTEGER NOT NULL DEFAULT 45,
  order_index INTEGER NOT NULL DEFAULT 1,
  is_published BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_tracks_difficulty CHECK (difficulty IN ('beginner', 'intermediate', 'advanced')),
  CONSTRAINT chk_tracks_estimated_minutes CHECK (estimated_minutes > 0),
  CONSTRAINT chk_tracks_order_index CHECK (order_index >= 0)
);

-- 4. Tabela public.lessons
CREATE TABLE IF NOT EXISTS public.lessons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  track_id UUID NOT NULL REFERENCES public.tracks(id) ON DELETE CASCADE,
  slug VARCHAR(100) NOT NULL UNIQUE,
  title VARCHAR(160) NOT NULL,
  summary TEXT NOT NULL,
  content_md TEXT NOT NULL,
  starter_code TEXT NOT NULL,
  solution_code TEXT NOT NULL,
  language VARCHAR(32) NOT NULL DEFAULT 'javascript',
  order_index INTEGER NOT NULL DEFAULT 1,
  xp_reward INTEGER NOT NULL DEFAULT 50,
  hints JSONB NOT NULL DEFAULT '[]'::jsonb,
  test_cases JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_published BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_lessons_order_index CHECK (order_index >= 0),
  CONSTRAINT chk_lessons_xp_reward CHECK (xp_reward > 0),
  CONSTRAINT chk_lessons_hints_array CHECK (jsonb_typeof(hints) = 'array'),
  CONSTRAINT chk_lessons_test_cases_array CHECK (jsonb_typeof(test_cases) = 'array')
);

CREATE INDEX IF NOT EXISTS idx_lessons_track_order
  ON public.lessons (track_id, order_index);

-- 5. Tabela public.user_lesson_progress (isolada por user_id)
CREATE TABLE IF NOT EXISTS public.user_lesson_progress (
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  lesson_id UUID NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL DEFAULT 'not_started',
  best_code TEXT,
  attempts_count INTEGER NOT NULL DEFAULT 0,
  max_hint_level_used SMALLINT NOT NULL DEFAULT 0,
  xp_awarded INTEGER NOT NULL DEFAULT 0,
  completed_at TIMESTAMPTZ,
  last_attempt_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, lesson_id),
  CONSTRAINT chk_user_lesson_progress_status CHECK (status IN ('not_started', 'in_progress', 'completed')),
  CONSTRAINT chk_user_lesson_progress_attempts CHECK (attempts_count >= 0),
  CONSTRAINT chk_user_lesson_progress_hint_level CHECK (max_hint_level_used BETWEEN 0 AND 3),
  CONSTRAINT chk_user_lesson_progress_xp_awarded CHECK (xp_awarded >= 0)
);

CREATE INDEX IF NOT EXISTS idx_user_lesson_progress_user_status
  ON public.user_lesson_progress (user_id, status);

-- 6. Tabela public.exercise_submissions (histórico imutável por tentativa)
CREATE TABLE IF NOT EXISTS public.exercise_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  lesson_id UUID NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  passed BOOLEAN NOT NULL DEFAULT FALSE,
  passed_cases INTEGER NOT NULL DEFAULT 0,
  total_cases INTEGER NOT NULL DEFAULT 0,
  execution_ms INTEGER NOT NULL DEFAULT 0,
  hint_level_used SMALLINT NOT NULL DEFAULT 0,
  xp_earned INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_exercise_submissions_cases CHECK (passed_cases >= 0 AND total_cases >= 0 AND passed_cases <= total_cases),
  CONSTRAINT chk_exercise_submissions_exec_ms CHECK (execution_ms >= 0),
  CONSTRAINT chk_exercise_submissions_hint_level CHECK (hint_level_used BETWEEN 0 AND 3),
  CONSTRAINT chk_exercise_submissions_xp CHECK (xp_earned >= 0),
  CONSTRAINT chk_exercise_submissions_code_size CHECK (char_length(code) <= 50000)
);

CREATE INDEX IF NOT EXISTS idx_exercise_submissions_user_lesson_created
  ON public.exercise_submissions (user_id, lesson_id, created_at DESC);

-- 7. RLS + Privilégios mínimos
ALTER TABLE public.tracks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lessons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_lesson_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exercise_submissions ENABLE ROW LEVEL SECURITY;

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
  USING (
    is_published = TRUE
    AND EXISTS (
      SELECT 1
      FROM public.tracks t
      WHERE t.id = lessons.track_id
        AND t.is_published = TRUE
    )
  );

DROP POLICY IF EXISTS user_lesson_progress_select_own ON public.user_lesson_progress;
CREATE POLICY user_lesson_progress_select_own
  ON public.user_lesson_progress
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS exercise_submissions_select_own ON public.exercise_submissions;
CREATE POLICY exercise_submissions_select_own
  ON public.exercise_submissions
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

REVOKE ALL ON TABLE public.tracks FROM anon, authenticated;
GRANT SELECT ON TABLE public.tracks TO anon, authenticated;

REVOKE ALL ON TABLE public.lessons FROM anon, authenticated;
GRANT SELECT ON TABLE public.lessons TO anon, authenticated;

REVOKE ALL ON TABLE public.user_lesson_progress FROM anon, authenticated;
GRANT SELECT ON TABLE public.user_lesson_progress TO authenticated;

REVOKE ALL ON TABLE public.exercise_submissions FROM anon, authenticated;
GRANT SELECT ON TABLE public.exercise_submissions TO authenticated;

-- 8. RPC atômica: record_lesson_attempt
-- Garante:
--   - Autenticação obrigatória (auth.uid())
--   - Progresso monotônico (RN-102): lição concluída nunca regride e nunca duplica XP
--   - Solução revelada (hint_level >= 3) concede 50% do XP
--   - Atualização atômica de XP, streak diário (UTC) e badges iniciais
CREATE OR REPLACE FUNCTION public.record_lesson_attempt(
  p_lesson_id UUID,
  p_code TEXT,
  p_passed BOOLEAN,
  p_passed_cases INTEGER,
  p_total_cases INTEGER,
  p_execution_ms INTEGER DEFAULT 0,
  p_hint_level_used SMALLINT DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_lesson public.lessons%ROWTYPE;
  v_progress public.user_lesson_progress%ROWTYPE;
  v_profile public.profiles%ROWTYPE;
  v_has_progress BOOLEAN := FALSE;
  v_already_completed BOOLEAN := FALSE;
  v_new_status VARCHAR(20);
  v_xp_earned INTEGER := 0;
  v_new_xp_total INTEGER := 0;
  v_new_streak INTEGER := 0;
  v_today DATE := (NOW() AT TIME ZONE 'UTC')::DATE;
  v_effective_hint SMALLINT := LEAST(GREATEST(COALESCE(p_hint_level_used, 0), 0), 3);
  v_safe_total INTEGER := GREATEST(COALESCE(p_total_cases, 0), 0);
  v_safe_passed INTEGER := LEAST(GREATEST(COALESCE(p_passed_cases, 0), 0), GREATEST(COALESCE(p_total_cases, 0), 0));
  v_safe_exec_ms INTEGER := GREATEST(COALESCE(p_execution_ms, 0), 0);
  v_badges TEXT[] := '{}';
  v_new_badges TEXT[] := '{}';
  v_completed_in_track INTEGER := 0;
  v_total_in_track INTEGER := 0;
  v_completed_at TIMESTAMPTZ := NULL;
  v_attempts_count INTEGER := 1;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE = '42501';
  END IF;

  IF p_code IS NULL OR char_length(p_code) > 50000 THEN
    RAISE EXCEPTION 'INVALID_CODE_PAYLOAD' USING ERRCODE = '22001';
  END IF;

  SELECT l.*
  INTO v_lesson
  FROM public.lessons l
  JOIN public.tracks t ON t.id = l.track_id
  WHERE l.id = p_lesson_id
    AND l.is_published = TRUE
    AND t.is_published = TRUE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'LESSON_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  -- Lock no perfil do aluno para atualização atômica de XP/streak/badges
  SELECT *
  INTO v_profile
  FROM public.profiles
  WHERE id = v_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PROFILE_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  SELECT *
  INTO v_progress
  FROM public.user_lesson_progress
  WHERE user_id = v_user_id
    AND lesson_id = p_lesson_id
  FOR UPDATE;

  v_has_progress := FOUND;
  v_already_completed := v_has_progress AND v_progress.status = 'completed';

  -- Monotonicidade (RN-102)
  IF v_already_completed THEN
    v_new_status := 'completed';
    v_xp_earned := 0;
    v_completed_at := v_progress.completed_at;
  ELSIF p_passed THEN
    v_new_status := 'completed';
    IF v_effective_hint >= 3 THEN
      v_xp_earned := GREATEST(1, FLOOR(v_lesson.xp_reward * 0.5)::INTEGER);
    ELSE
      v_xp_earned := v_lesson.xp_reward;
    END IF;
    v_completed_at := NOW();
  ELSE
    v_new_status := 'in_progress';
    v_xp_earned := 0;
    v_completed_at := NULL;
  END IF;

  -- Registra tentativa no histórico
  INSERT INTO public.exercise_submissions (
    user_id,
    lesson_id,
    code,
    passed,
    passed_cases,
    total_cases,
    execution_ms,
    hint_level_used,
    xp_earned
  )
  VALUES (
    v_user_id,
    p_lesson_id,
    p_code,
    p_passed,
    v_safe_passed,
    v_safe_total,
    v_safe_exec_ms,
    v_effective_hint,
    v_xp_earned
  );

  -- Upsert no progresso da lição
  IF v_has_progress THEN
    v_attempts_count := v_progress.attempts_count + 1;
    UPDATE public.user_lesson_progress
    SET
      status = v_new_status,
      best_code = CASE WHEN p_passed OR v_progress.best_code IS NULL THEN p_code ELSE v_progress.best_code END,
      attempts_count = v_attempts_count,
      max_hint_level_used = GREATEST(v_progress.max_hint_level_used, v_effective_hint),
      xp_awarded = CASE WHEN v_already_completed THEN v_progress.xp_awarded ELSE GREATEST(v_progress.xp_awarded, v_xp_earned) END,
      completed_at = COALESCE(v_progress.completed_at, v_completed_at),
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
      p_code,
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

  -- Atualiza streak e badges apenas quando há conclusão nova
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

    -- Badge: primeira lição concluída
    IF NOT ('first_lesson' = ANY(v_badges)) THEN
      v_badges := array_append(v_badges, 'first_lesson');
      v_new_badges := array_append(v_new_badges, 'first_lesson');
    END IF;

    -- Badge: resolveu sem dicas
    IF v_effective_hint = 0 AND NOT ('no_hint_solver' = ANY(v_badges)) THEN
      v_badges := array_append(v_badges, 'no_hint_solver');
      v_new_badges := array_append(v_new_badges, 'no_hint_solver');
    END IF;

    -- Badge: streak de 3 dias
    IF v_new_streak >= 3 AND NOT ('streak_3' = ANY(v_badges)) THEN
      v_badges := array_append(v_badges, 'streak_3');
      v_new_badges := array_append(v_new_badges, 'streak_3');
    END IF;

    -- Badge: concluiu todas as lições publicadas da trilha
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

    IF v_total_in_track > 0
      AND v_completed_in_track >= v_total_in_track
      AND NOT ('js_fundamentals_complete' = ANY(v_badges))
    THEN
      v_badges := array_append(v_badges, 'js_fundamentals_complete');
      v_new_badges := array_append(v_new_badges, 'js_fundamentals_complete');
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

REVOKE ALL ON FUNCTION public.record_lesson_attempt(UUID, TEXT, BOOLEAN, INTEGER, INTEGER, INTEGER, SMALLINT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_lesson_attempt(UUID, TEXT, BOOLEAN, INTEGER, INTEGER, INTEGER, SMALLINT) TO authenticated;

-- 9. Seed idempotente: Trilha inicial "Fundamentos de JavaScript" + 5 lições progressivas
WITH upserted_track AS (
  INSERT INTO public.tracks (
    slug,
    title,
    description,
    difficulty,
    language,
    estimated_minutes,
    order_index,
    is_published
  )
  VALUES (
    'fundamentos-javascript',
    'Fundamentos de JavaScript',
    'Domine variáveis, condicionais, funções, arrays e objetos em 5 desafios práticos com correção automática e dicas progressivas do Octopy.',
    'beginner',
    'javascript',
    50,
    1,
    TRUE
  )
  ON CONFLICT (slug) DO UPDATE SET
    title = EXCLUDED.title,
    description = EXCLUDED.description,
    difficulty = EXCLUDED.difficulty,
    language = EXCLUDED.language,
    estimated_minutes = EXCLUDED.estimated_minutes,
    order_index = EXCLUDED.order_index,
    is_published = EXCLUDED.is_published,
    updated_at = NOW()
  RETURNING id
)
INSERT INTO public.lessons (
  track_id,
  slug,
  title,
  summary,
  content_md,
  starter_code,
  solution_code,
  language,
  order_index,
  xp_reward,
  hints,
  test_cases,
  is_published
)
SELECT
  t.id,
  v.slug,
  v.title,
  v.summary,
  v.content_md,
  v.starter_code,
  v.solution_code,
  'javascript',
  v.order_index,
  v.xp_reward,
  v.hints::jsonb,
  v.test_cases::jsonb,
  TRUE
FROM upserted_track t
CROSS JOIN (
  VALUES
    (
      'variaveis-e-saudacao',
      'Variáveis e strings',
      'Monte uma saudação personalizada usando template strings e tratamento de espaços.',
      '### Desafio\nCrie a função `saudar(nome)` que recebe um texto com o nome da pessoa e retorna `"Olá, <nome>!"`.\n\n### Regras\n- Remova espaços extras no início e no fim de `nome` usando `.trim()`.\n- Se o nome vier vazio ou só com espaços, retorne `"Olá, estudante!"`.',
      E'function saudar(nome) {\n  // Remova espaços extras e retorne a saudação esperada\n  return "";\n}\n',
      E'function saudar(nome) {\n  const limpo = String(nome ?? "").trim();\n  if (!limpo) {\n    return "Olá, estudante!";\n  }\n  return `Olá, ${limpo}!`;\n}\n',
      1,
      50,
      '[
        {"level":1,"title":"Conceito","content":"Strings em JavaScript têm o método .trim() para limpar espaços nas pontas e template strings com crase (`Olá, ${valor}!`) facilitam montar frases."},
        {"level":2,"title":"Pista prática","content":"Guarde const limpo = String(nome ?? \"\").trim(); verifique if (!limpo) para retornar \"Olá, estudante!\" antes da frase final."},
        {"level":3,"title":"Solução guiada","content":"Use const limpo = String(nome ?? \"\").trim(); se !limpo retorne \"Olá, estudante!\"; caso contrário retorne `Olá, ${limpo}!`."}
      ]',
      '[
        {"id":"c1","label":"Saúda um nome simples","expression":"saudar(\"Ana\")","expected":"Olá, Ana!"},
        {"id":"c2","label":"Remove espaços extras nas pontas","expression":"saudar(\"  Lucas  \")","expected":"Olá, Lucas!"},
        {"id":"c3","label":"Usa fallback para string vazia","expression":"saudar(\"   \")","expected":"Olá, estudante!"}
      ]'
    ),
    (
      'condicionais-e-logica',
      'Condicionais e faixas de nota',
      'Classifique o desempenho de um aluno usando estruturas if/else encadeadas.',
      '### Desafio\nImplemente a função `classificarNota(nota)` que recebe um número de `0` a `10` e retorna:\n- `"Excelente"` para notas `>= 9`\n- `"Aprovado"` para notas `>= 7` e `< 9`\n- `"Recuperação"` para notas `>= 5` e `< 7`\n- `"Reprovado"` para notas `< 5`',
      E'function classificarNota(nota) {\n  // Retorne "Excelente", "Aprovado", "Recuperação" ou "Reprovado"\n}\n',
      E'function classificarNota(nota) {\n  if (nota >= 9) return "Excelente";\n  if (nota >= 7) return "Aprovado";\n  if (nota >= 5) return "Recuperação";\n  return "Reprovado";\n}\n',
      2,
      60,
      '[
        {"level":1,"title":"Conceito","content":"Ao testar faixas numéricas de cima para baixo (9, depois 7, depois 5), cada return encerra a função e evita sobreposição."},
        {"level":2,"title":"Pista prática","content":"Comece com if (nota >= 9) return \"Excelente\"; depois teste >= 7 e >= 5. O retorno final cobre qualquer valor abaixo de 5."},
        {"level":3,"title":"Solução guiada","content":"Encadeie if (nota >= 9) return \"Excelente\"; if (nota >= 7) return \"Aprovado\"; if (nota >= 5) return \"Recuperação\"; return \"Reprovado\";."}
      ]',
      '[
        {"id":"c1","label":"Nota 9.5 é Excelente","expression":"classificarNota(9.5)","expected":"Excelente"},
        {"id":"c2","label":"Nota 7 é Aprovado","expression":"classificarNota(7)","expected":"Aprovado"},
        {"id":"c3","label":"Nota 5.5 é Recuperação","expression":"classificarNota(5.5)","expected":"Recuperação"},
        {"id":"c4","label":"Nota 4 é Reprovado","expression":"classificarNota(4)","expected":"Reprovado"}
      ]'
    ),
    (
      'funcoes-e-calculos',
      'Funções e cálculos puros',
      'Calcule o preço final com desconto percentual validando limites de entrada.',
      '### Desafio\nImplemente `aplicarDesconto(preco, percentual)` que retorna o preço final após aplicar o desconto.\n\n### Regras\n- Arredonde o resultado para 2 casas decimais como número (`Number(valor.toFixed(2))`).\n- Se `percentual` for menor que `0`, trate como `0`. Se for maior que `100`, trate como `100`.',
      E'function aplicarDesconto(preco, percentual) {\n  // Calcule o preço com desconto arredondado para 2 casas\n}\n',
      E'function aplicarDesconto(preco, percentual) {\n  const taxa = Math.min(100, Math.max(0, percentual));\n  const final = preco * (1 - taxa / 100);\n  return Number(final.toFixed(2));\n}\n',
      3,
      70,
      '[
        {"level":1,"title":"Conceito","content":"Limitar um valor entre mínimo e máximo (clamp) evita descontos negativos ou acima de 100%. Use Math.min e Math.max."},
        {"level":2,"title":"Pista prática","content":"Faça const taxa = Math.min(100, Math.max(0, percentual)); multiplique preco * (1 - taxa / 100) e converta .toFixed(2) com Number(...)."},
        {"level":3,"title":"Solução guiada","content":"Calcule const taxa = Math.min(100, Math.max(0, percentual)); return Number((preco * (1 - taxa / 100)).toFixed(2));."}
      ]',
      '[
        {"id":"c1","label":"Aplica 10% sobre 100","expression":"aplicarDesconto(100, 10)","expected":90},
        {"id":"c2","label":"Arredonda para 2 casas decimais","expression":"aplicarDesconto(49.9, 15)","expected":42.42},
        {"id":"c3","label":"Limita desconto negativo a 0%","expression":"aplicarDesconto(80, -20)","expected":80},
        {"id":"c4","label":"Limita desconto acima de 100%","expression":"aplicarDesconto(80, 150)","expected":0}
      ]'
    ),
    (
      'arrays-e-lacos',
      'Arrays e acumulação',
      'Percorra listas numéricas filtrando apenas valores positivos.',
      '### Desafio\nCrie a função `somarPositivos(numeros)` que recebe um array de números e retorna a soma apenas dos valores maiores que `0`.\n\n### Regras\n- Se o array estiver vazio ou só tiver números negativos/zero, retorne `0`.',
      E'function somarPositivos(numeros) {\n  // Some apenas os números maiores que zero\n}\n',
      E'function somarPositivos(numeros) {\n  let total = 0;\n  for (const n of numeros) {\n    if (n > 0) {\n      total += n;\n    }\n  }\n  return total;\n}\n',
      4,
      80,
      '[
        {"level":1,"title":"Conceito","content":"Você pode percorrer um array com for...of ou combinar .filter() com .reduce() começando o acumulador em 0."},
        {"level":2,"title":"Pista prática","content":"Inicialize let total = 0; dentro do laço for (const n of numeros), adicione if (n > 0) total += n; e retorne total."},
        {"level":3,"title":"Solução guiada","content":"Use let total = 0; for (const n of numeros) { if (n > 0) total += n; } return total;."}
      ]',
      '[
        {"id":"c1","label":"Soma positivos misturados com negativos","expression":"somarPositivos([3, -2, 7, 0, -5, 4])","expected":14},
        {"id":"c2","label":"Retorna 0 para lista vazia","expression":"somarPositivos([])","expected":0},
        {"id":"c3","label":"Ignora lista só com negativos","expression":"somarPositivos([-1, -10, 0])","expected":0}
      ]'
    ),
    (
      'objetos-e-transformacao',
      'Objetos e resumo de progresso',
      'Combine propriedades de objetos e arrays para gerar um relatório estruturado.',
      '### Desafio\nImplemente `resumirAluno(aluno)` que recebe um objeto `{ nome: string, notas: number[] }` e retorna um novo objeto:\n```js\n{ nome: string, media: number, aprovado: boolean }\n```\n\n### Regras\n- `media` deve ser a média aritmética arredondada para 1 casa decimal (`Number(media.toFixed(1))`), ou `0` se `notas` estiver vazio.\n- `aprovado` é `true` quando `media >= 7`.',
      E'function resumirAluno(aluno) {\n  // Calcule a média e retorne { nome, media, aprovado }\n}\n',
      E'function resumirAluno(aluno) {\n  const notas = Array.isArray(aluno.notas) ? aluno.notas : [];\n  const soma = notas.reduce((acc, n) => acc + n, 0);\n  const media = notas.length > 0 ? Number((soma / notas.length).toFixed(1)) : 0;\n  return {\n    nome: aluno.nome,\n    media,\n    aprovado: media >= 7,\n  };\n}\n',
      5,
      100,
      '[
        {"level":1,"title":"Conceito","content":"A média aritmética é a soma das notas dividida pela quantidade de itens. Trate o caso de array vazio para evitar divisão por zero (NaN)."},
        {"level":2,"title":"Pista prática","content":"Some com notas.reduce((acc, n) => acc + n, 0), calcule media = notas.length ? Number((soma / notas.length).toFixed(1)) : 0 e retorne { nome: aluno.nome, media, aprovado: media >= 7 }."},
        {"level":3,"title":"Solução guiada","content":"Calcule a soma com reduce, proteja notas.length === 0 retornando 0, arredonde com toFixed(1) e retorne { nome: aluno.nome, media, aprovado: media >= 7 }."}
      ]',
      '[
        {"id":"c1","label":"Aluno aprovado com média exata","expression":"resumirAluno({ nome: \"Bia\", notas: [8, 9, 7] })","expected":{"nome":"Bia","media":8,"aprovado":true}},
        {"id":"c2","label":"Aluno reprovado com arredondamento","expression":"resumirAluno({ nome: \"Caio\", notas: [5, 6, 6] })","expected":{"nome":"Caio","media":5.7,"aprovado":false}},
        {"id":"c3","label":"Lista de notas vazia retorna média 0","expression":"resumirAluno({ nome: \"Duda\", notas: [] })","expected":{"nome":"Duda","media":0,"aprovado":false}}
      ]'
    )
) AS v(slug, title, summary, content_md, starter_code, solution_code, order_index, xp_reward, hints, test_cases)
ON CONFLICT (slug) DO UPDATE SET
  track_id = EXCLUDED.track_id,
  title = EXCLUDED.title,
  summary = EXCLUDED.summary,
  content_md = EXCLUDED.content_md,
  starter_code = EXCLUDED.starter_code,
  solution_code = EXCLUDED.solution_code,
  language = EXCLUDED.language,
  order_index = EXCLUDED.order_index,
  xp_reward = EXCLUDED.xp_reward,
  hints = EXCLUDED.hints,
  test_cases = EXCLUDED.test_cases,
  is_published = EXCLUDED.is_published,
  updated_at = NOW();

NOTIFY pgrst, 'reload schema';
