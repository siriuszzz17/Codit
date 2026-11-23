-- ==============================================================================
-- Codit (TCC-Codit) — Migração Inicial Supabase (Fase 2)
-- Tabelas: public.profiles e public.sandbox_projects + triggers + RLS
-- ==============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Função compartilhada para atualização automática de `updated_at` em UTC
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- ==============================================================================
-- 1. Tabela public.profiles (1:1 com auth.users)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email VARCHAR(255) NOT NULL,
  full_name VARCHAR(120) NOT NULL DEFAULT '',
  avatar_url TEXT,
  role VARCHAR(20) NOT NULL DEFAULT 'student'
    CONSTRAINT chk_profiles_role CHECK (role IN ('student', 'admin')),
  bio TEXT
    CONSTRAINT chk_profiles_bio_length CHECK (bio IS NULL OR char_length(bio) <= 500),
  github_username VARCHAR(60)
    CONSTRAINT chk_profiles_github_format CHECK (
      github_username IS NULL
      OR github_username ~ '^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$'
    ),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_profiles_email_lower
  ON public.profiles (lower(email));

DROP TRIGGER IF EXISTS trg_profiles_set_updated_at ON public.profiles;
CREATE TRIGGER trg_profiles_set_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- Proteção anti-escalação de privilégio: apenas service_role pode alterar `role`
CREATE OR REPLACE FUNCTION public.prevent_profile_role_escalation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role AND auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'Alteração direta do campo role não permitida.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_prevent_role_escalation ON public.profiles;
CREATE TRIGGER trg_profiles_prevent_role_escalation
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_profile_role_escalation();

-- Provisionamento automático de perfil ao cadastrar usuário em auth.users
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

  INSERT INTO public.profiles (id, email, full_name, avatar_url, role)
  VALUES (NEW.id, v_email, v_full_name, v_avatar_url, 'student')
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS profiles_select_own ON public.profiles;
CREATE POLICY profiles_select_own
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

DROP POLICY IF EXISTS profiles_insert_own ON public.profiles;
CREATE POLICY profiles_insert_own
  ON public.profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id AND role = 'student');

DROP POLICY IF EXISTS profiles_update_own ON public.profiles;
CREATE POLICY profiles_update_own
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- ==============================================================================
-- 2. Tabela public.sandbox_projects (dados privados por user_id + portfólio)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.sandbox_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL
    CONSTRAINT fk_sandbox_projects_user_id REFERENCES public.profiles(id) ON DELETE CASCADE,
  title VARCHAR(120) NOT NULL
    CONSTRAINT chk_sandbox_projects_title CHECK (char_length(btrim(title)) > 0),
  description TEXT
    CONSTRAINT chk_sandbox_projects_description CHECK (description IS NULL OR char_length(description) <= 500),
  primary_language VARCHAR(30) NOT NULL DEFAULT 'html_css_js'
    CONSTRAINT chk_sandbox_projects_language CHECK (
      primary_language IN ('html_css_js', 'python', 'javascript', 'typescript')
    ),
  runtime_target VARCHAR(30) NOT NULL DEFAULT 'client_iframe'
    CONSTRAINT chk_sandbox_projects_runtime CHECK (
      runtime_target IN ('client_iframe', 'client_pyodide', 'remote_judge0', 'remote_piston')
    ),
  source_code TEXT NOT NULL DEFAULT ''
    CONSTRAINT chk_sandbox_projects_source_size CHECK (char_length(source_code) <= 200000),
  visibility VARCHAR(20) NOT NULL DEFAULT 'private'
    CONSTRAINT chk_sandbox_projects_visibility CHECK (
      visibility IN ('private', 'unlisted', 'public_portfolio')
    ),
  share_slug VARCHAR(80),
  version INTEGER NOT NULL DEFAULT 1
    CONSTRAINT chk_sandbox_projects_version CHECK (version >= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_projects_user_updated
  ON public.sandbox_projects (user_id, updated_at DESC)
  WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_sandbox_projects_share_slug
  ON public.sandbox_projects (share_slug)
  WHERE share_slug IS NOT NULL AND deleted_at IS NULL;

DROP TRIGGER IF EXISTS trg_sandbox_projects_set_updated_at ON public.sandbox_projects;
CREATE TRIGGER trg_sandbox_projects_set_updated_at
  BEFORE UPDATE ON public.sandbox_projects
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.sandbox_projects ENABLE ROW LEVEL SECURITY;

-- Nota: a policy do dono não filtra `deleted_at IS NULL` para permitir retorno de
-- `.update({ deleted_at }).select()` no soft delete; consultas ativas filtram no app.
DROP POLICY IF EXISTS sandbox_projects_select_own ON public.sandbox_projects;
CREATE POLICY sandbox_projects_select_own
  ON public.sandbox_projects
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS sandbox_projects_select_public_portfolio ON public.sandbox_projects;
CREATE POLICY sandbox_projects_select_public_portfolio
  ON public.sandbox_projects
  FOR SELECT
  TO anon, authenticated
  USING (visibility = 'public_portfolio' AND deleted_at IS NULL);

DROP POLICY IF EXISTS sandbox_projects_insert_own ON public.sandbox_projects;
CREATE POLICY sandbox_projects_insert_own
  ON public.sandbox_projects
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS sandbox_projects_update_own ON public.sandbox_projects;
CREATE POLICY sandbox_projects_update_own
  ON public.sandbox_projects
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS sandbox_projects_delete_own ON public.sandbox_projects;
CREATE POLICY sandbox_projects_delete_own
  ON public.sandbox_projects
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);
