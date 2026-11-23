-- ==============================================================================
-- Codit (TCC-Codit) — Correção de Privilégios SQL (GRANTs + RLS),
-- Integridade de Provisionamento e Regra de Cooldown de 30 Dias para @username
-- ==============================================================================
-- Diagnóstico que originou esta migração:
-- 1) As migrações 20261122000001 e 20261123000002 habilitaram RLS e policies,
--    mas não concederam privilégios de tabela (GRANT SELECT/INSERT/UPDATE/DELETE)
--    para `anon` e `authenticated`, gerando HTTP 401 / SQLSTATE 42501
--    (`permission denied for table ...`) ao abrir "Meu perfil" e "Comunidade".
-- 2) Adiciona `profiles.username_changed_at` (privada, nunca espelhada em
--    `public_profiles`) para liberar a 1ª definição imediata do @usuário e
--    aplicar intervalo mínimo de 30 dias entre mudanças posteriores no banco.
-- 3) Endurece proteção anti-impersonação e `search_path` nas funções/triggers.
-- ==============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ==============================================================================
-- 1. Coluna privada de controle de alteração do @username em public.profiles
-- ==============================================================================
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS username_changed_at TIMESTAMPTZ;

-- ==============================================================================
-- 2. Endurecimento de triggers base com `SET search_path = public`
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.prevent_profile_role_escalation()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_is_privileged BOOLEAN;
BEGIN
  v_is_privileged := (
    COALESCE(auth.role(), '') = 'service_role'
    OR current_user IN ('postgres', 'supabase_admin')
  );

  IF NEW.role IS DISTINCT FROM OLD.role AND NOT v_is_privileged THEN
    RAISE EXCEPTION 'Alteração direta do campo role não permitida.'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_friendship_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.requester_id IS DISTINCT FROM OLD.requester_id
     OR NEW.addressee_id IS DISTINCT FROM OLD.addressee_id THEN
    RAISE EXCEPTION 'Não é permitido alterar os participantes de uma amizade.'
      USING ERRCODE = 'P0001';
  END IF;

  IF OLD.status = 'accepted' AND NEW.status <> 'accepted' THEN
    RAISE EXCEPTION 'Não é permitido reverter uma amizade aceita para pendente.'
      USING ERRCODE = 'P0001';
  END IF;

  IF NEW.status = 'accepted' THEN
    NEW.accepted_at := COALESCE(OLD.accepted_at, NOW());
  END IF;

  RETURN NEW;
END;
$$;

-- ==============================================================================
-- 3. Proteção anti-impersonação e termos reservados para @username
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.is_reserved_or_impersonation_username(
  p_username TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_norm TEXT;
  v_reserved CONSTANT TEXT[] := ARRAY[
    'admin',
    'administrator',
    'administrador',
    'codit',
    'codit_oficial',
    'codit.oficial',
    'octopy',
    'octopy_oficial',
    'suporte',
    'support',
    'sistema',
    'system',
    'oficial',
    'official',
    'staff',
    'equipe',
    'moderador',
    'moderator',
    'mod',
    'root',
    'security',
    'seguranca',
    'help',
    'ajuda',
    'api',
    'auth',
    'conta',
    'comunidade',
    'perfil',
    'offline',
    'www',
    'mail',
    'noreply',
    'postmaster',
    'webmaster',
    'owner',
    'founder',
    'ceo'
  ];
BEGIN
  v_norm := lower(regexp_replace(btrim(COALESCE(p_username, '')), '^@+', ''));
  IF v_norm = '' THEN
    RETURN TRUE;
  END IF;

  IF v_norm = ANY(v_reserved) THEN
    RETURN TRUE;
  END IF;

  IF v_norm ~ '^(codit|octopy)[._](oficial|official|admin|administrador|suporte|support|staff|equipe|mod|moderador|team|seguranca|security)$' THEN
    RETURN TRUE;
  END IF;

  IF v_norm ~ '^(oficial|official|admin|administrador|suporte|support|staff|equipe|mod|moderador|team|seguranca|security)[._](codit|octopy)$' THEN
    RETURN TRUE;
  END IF;

  RETURN FALSE;
END;
$$;

CREATE OR REPLACE FUNCTION public.generate_unique_username(
  p_seed TEXT,
  p_exclude_id UUID DEFAULT NULL
)
RETURNS VARCHAR(30)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clean TEXT;
  v_base TEXT;
  v_candidate VARCHAR(30);
  v_suffix TEXT;
  v_attempt INTEGER := 0;
BEGIN
  v_clean := lower(
    translate(
      COALESCE(p_seed, ''),
      'áàãâäéèêëíìîïóòõôöúùûüçñýÿÁÀÃÂÄÉÈÊËÍÌÎÏÓÒÕÔÖÚÙÛÜÇÑÝ',
      'aaaaaeeeeiiiiooooouuuucnyyaaaaaeeeeiiiiooooouuuucny'
    )
  );
  v_clean := regexp_replace(v_clean, '^@+', '');
  v_clean := regexp_replace(v_clean, '[^a-z0-9._]+', '_', 'g');
  v_clean := regexp_replace(v_clean, '[._]{2,}', '_', 'g');
  v_clean := btrim(v_clean, '._');

  IF v_clean IS NULL OR v_clean = '' THEN
    v_clean := 'codit';
  END IF;

  IF char_length(v_clean) < 3 THEN
    v_clean := v_clean || '_dev';
  END IF;

  IF public.is_reserved_or_impersonation_username(v_clean) THEN
    v_clean := v_clean || '_dev';
  END IF;

  v_base := btrim(left(v_clean, 30), '._');
  IF v_base IS NULL OR char_length(v_base) < 3 OR v_base ~ '[._]{2}' THEN
    v_base := 'codit';
  END IF;

  v_candidate := v_base;

  LOOP
    EXIT WHEN NOT EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE lower(p.username) = lower(v_candidate)
        AND (p_exclude_id IS NULL OR p.id <> p_exclude_id)
    )
    AND v_candidate ~ '^[a-z0-9](?:[a-z0-9._]{1,28}[a-z0-9])$'
    AND v_candidate !~ '[._]{2}'
    AND NOT public.is_reserved_or_impersonation_username(v_candidate);

    v_attempt := v_attempt + 1;
    IF v_attempt > 25 THEN
      v_suffix := substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);
      v_candidate := 'codit_' || v_suffix;
    ELSE
      v_suffix := substr(replace(gen_random_uuid()::text, '-', ''), 1, 5);
      v_candidate := COALESCE(NULLIF(btrim(left(v_base, 24), '._'), ''), 'codit') || '_' || v_suffix;
    END IF;
  END LOOP;

  RETURN v_candidate;
END;
$$;

-- ==============================================================================
-- 4. Validação de @username no banco + Cooldown obrigatório de 30 dias
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.normalize_profile_username()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_normalized TEXT;
  v_is_privileged BOOLEAN;
  v_next_allowed TIMESTAMPTZ;
BEGIN
  v_is_privileged := (
    COALESCE(auth.role(), '') = 'service_role'
    OR current_user IN ('postgres', 'supabase_admin')
  );

  IF TG_OP = 'INSERT' THEN
    IF NEW.username IS NULL OR btrim(NEW.username) = '' THEN
      NEW.username := public.generate_unique_username(
        COALESCE(
          NULLIF(btrim(NEW.full_name), ''),
          NULLIF(split_part(COALESCE(NEW.email, ''), '@', 1), ''),
          'codit'
        ),
        NEW.id
      );
      NEW.username_changed_at := NULL;
      RETURN NEW;
    END IF;

    v_normalized := lower(regexp_replace(btrim(NEW.username), '^@+', ''));
    IF v_normalized !~ '^[a-z0-9](?:[a-z0-9._]{1,28}[a-z0-9])$'
       OR v_normalized ~ '[._]{2}' THEN
      RAISE EXCEPTION 'Formato inválido para @usuário.'
        USING ERRCODE = '23514';
    END IF;

    IF public.is_reserved_or_impersonation_username(v_normalized) THEN
      RAISE EXCEPTION 'Este @usuário é reservado ou protegido contra impersonação no Codit.'
        USING ERRCODE = '23514';
    END IF;

    NEW.username := v_normalized;
    IF NOT v_is_privileged THEN
      NEW.username_changed_at := NOW();
    END IF;
    RETURN NEW;
  END IF;

  -- TG_OP = 'UPDATE': cliente nunca pode zerar/retrodatar username_changed_at
  IF NOT v_is_privileged THEN
    NEW.username_changed_at := OLD.username_changed_at;
  END IF;

  IF NEW.username IS NULL OR btrim(NEW.username) = '' THEN
    NEW.username := OLD.username;
    RETURN NEW;
  END IF;

  v_normalized := lower(regexp_replace(btrim(NEW.username), '^@+', ''));

  IF v_normalized = lower(OLD.username) THEN
    NEW.username := OLD.username;
    RETURN NEW;
  END IF;

  IF v_normalized !~ '^[a-z0-9](?:[a-z0-9._]{1,28}[a-z0-9])$'
     OR v_normalized ~ '[._]{2}' THEN
    RAISE EXCEPTION 'Formato inválido para @usuário.'
      USING ERRCODE = '23514';
  END IF;

  IF public.is_reserved_or_impersonation_username(v_normalized) THEN
    RAISE EXCEPTION 'Este @usuário é reservado ou protegido contra impersonação no Codit.'
      USING ERRCODE = '23514';
  END IF;

  IF OLD.username_changed_at IS NOT NULL
     AND (OLD.username_changed_at + INTERVAL '30 days') > NOW()
     AND NOT v_is_privileged THEN
    v_next_allowed := OLD.username_changed_at + INTERVAL '30 days';
    RAISE EXCEPTION 'USERNAME_COOLDOWN_ACTIVE:%',
      to_char(v_next_allowed AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
      USING ERRCODE = 'P0001',
            DETAIL = 'Intervalo mínimo de 30 dias entre alterações de @usuário.',
            HINT = 'Aguarde a data liberada para alterar seu @usuário novamente.';
  END IF;

  NEW.username := v_normalized;
  NEW.username_changed_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_normalize_username ON public.profiles;
CREATE TRIGGER trg_profiles_normalize_username
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.normalize_profile_username();

-- Atualizar provisionamento automático no cadastro de auth.users
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email TEXT;
  v_raw_name TEXT;
  v_fallback_name TEXT;
  v_full_name TEXT;
  v_avatar_url TEXT;
  v_raw_username TEXT;
  v_username VARCHAR(30);
  v_changed_at TIMESTAMPTZ;
BEGIN
  v_email := lower(COALESCE(NEW.email, ''));
  v_raw_name := NULLIF(
    btrim(
      COALESCE(
        NEW.raw_user_meta_data->>'full_name',
        NEW.raw_user_meta_data->>'name',
        ''
      )
    ),
    ''
  );
  v_fallback_name := NULLIF(btrim(split_part(v_email, '@', 1)), '');
  v_full_name := left(COALESCE(v_raw_name, v_fallback_name, 'Estudante Codit'), 120);

  v_avatar_url := NULLIF(
    btrim(
      COALESCE(
        NEW.raw_user_meta_data->>'avatar_url',
        NEW.raw_user_meta_data->>'picture',
        ''
      )
    ),
    ''
  );

  v_raw_username := lower(
    regexp_replace(
      btrim(COALESCE(NEW.raw_user_meta_data->>'username', '')),
      '^@+',
      ''
    )
  );

  IF v_raw_username ~ '^[a-z0-9](?:[a-z0-9._]{1,28}[a-z0-9])$'
     AND v_raw_username !~ '[._]{2}'
     AND NOT public.is_reserved_or_impersonation_username(v_raw_username)
     AND NOT EXISTS (
       SELECT 1
       FROM public.profiles p
       WHERE lower(p.username) = v_raw_username
     ) THEN
    v_username := v_raw_username;
    v_changed_at := NOW();
  ELSE
    v_username := public.generate_unique_username(
      COALESCE(v_raw_name, v_fallback_name, 'codit'),
      NEW.id
    );
    v_changed_at := NULL;
  END IF;

  INSERT INTO public.profiles (
    id,
    email,
    full_name,
    username,
    username_changed_at,
    avatar_url,
    role
  )
  VALUES (
    NEW.id,
    v_email,
    v_full_name,
    v_username,
    v_changed_at,
    v_avatar_url,
    'student'
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

-- ==============================================================================
-- 5. Backfill idempotente de perfis faltantes e espelho público sem PII
-- ==============================================================================
DO $$
DECLARE
  r RECORD;
  v_email TEXT;
  v_full_name TEXT;
  v_avatar_url TEXT;
  v_username VARCHAR(30);
BEGIN
  FOR r IN
    SELECT u.id, u.email, u.raw_user_meta_data
    FROM auth.users u
    LEFT JOIN public.profiles p ON p.id = u.id
    WHERE p.id IS NULL
      AND COALESCE(btrim(u.email), '') <> ''
  LOOP
    v_email := lower(btrim(r.email));
    IF EXISTS (
      SELECT 1
      FROM public.profiles existing
      WHERE lower(existing.email) = v_email
    ) THEN
      CONTINUE;
    END IF;

    v_full_name := left(
      COALESCE(
        NULLIF(
          btrim(
            COALESCE(
              r.raw_user_meta_data->>'full_name',
              r.raw_user_meta_data->>'name',
              ''
            )
          ),
          ''
        ),
        NULLIF(btrim(split_part(v_email, '@', 1)), ''),
        'Estudante Codit'
      ),
      120
    );

    v_avatar_url := NULLIF(
      btrim(
        COALESCE(
          r.raw_user_meta_data->>'avatar_url',
          r.raw_user_meta_data->>'picture',
          ''
        )
      ),
      ''
    );

    v_username := public.generate_unique_username(v_full_name, r.id);

    INSERT INTO public.profiles (
      id,
      email,
      full_name,
      username,
      username_changed_at,
      avatar_url,
      role
    )
    VALUES (
      r.id,
      v_email,
      v_full_name,
      v_username,
      NULL,
      v_avatar_url,
      'student'
    )
    ON CONFLICT (id) DO NOTHING;
  END LOOP;
END;
$$;

-- Re-sincronizar public_profiles (estritamente sem email/role/username_changed_at)
INSERT INTO public.public_profiles (
  id,
  username,
  full_name,
  avatar_url,
  bio,
  github_username,
  created_at,
  updated_at
)
SELECT
  id,
  username,
  full_name,
  avatar_url,
  bio,
  github_username,
  created_at,
  updated_at
FROM public.profiles
ON CONFLICT (id) DO UPDATE SET
  username = EXCLUDED.username,
  full_name = EXCLUDED.full_name,
  avatar_url = EXCLUDED.avatar_url,
  bio = EXCLUDED.bio,
  github_username = EXCLUDED.github_username,
  updated_at = EXCLUDED.updated_at;

-- ==============================================================================
-- 6. Privilégios SQL mínimos (GRANTs) + Reafirmação de RLS em todas as tabelas
-- ==============================================================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.public_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sandbox_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.friendships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_comments ENABLE ROW LEVEL SECURITY;

GRANT USAGE ON SCHEMA public TO anon, authenticated;

-- profiles: privado ao dono autenticado (sem anon, sem DELETE direto)
REVOKE ALL ON TABLE public.profiles FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.profiles TO authenticated;

-- public_profiles: somente leitura (escrita apenas via trigger SECURITY DEFINER)
REVOKE ALL ON TABLE public.public_profiles FROM anon, authenticated;
GRANT SELECT ON TABLE public.public_profiles TO anon, authenticated;

-- sandbox_projects: leitura restrita para anon (public_portfolio via RLS); CRUD ao dono autenticado
REVOKE ALL ON TABLE public.sandbox_projects FROM anon, authenticated;
GRANT SELECT ON TABLE public.sandbox_projects TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.sandbox_projects TO authenticated;

-- friendships: exclusivamente usuários autenticados (RLS restringe aos participantes)
REVOKE ALL ON TABLE public.friendships FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.friendships TO authenticated;

-- project_likes: leitura para projetos visíveis; curtir/descurtir apenas autenticados
REVOKE ALL ON TABLE public.project_likes FROM anon, authenticated;
GRANT SELECT ON TABLE public.project_likes TO anon;
GRANT SELECT, INSERT, DELETE ON TABLE public.project_likes TO authenticated;

-- project_comments: leitura para projetos visíveis; comentar/excluir conforme RLS
REVOKE ALL ON TABLE public.project_comments FROM anon, authenticated;
GRANT SELECT ON TABLE public.project_comments TO anon;
GRANT SELECT, INSERT, DELETE ON TABLE public.project_comments TO authenticated;

-- Funções RPC / auxiliares
GRANT EXECUTE ON FUNCTION public.get_profile_friend_count(UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_friend_with_current_user(UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.can_view_sandbox_project(UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_reserved_or_impersonation_username(TEXT) TO anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.generate_unique_username(TEXT, UUID) FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';
