-- ==============================================================================
-- Codit (TCC-Codit) — Migração Rede Social Embutida (Comunidade Codit)
-- Tabelas/Colunas: profiles.username, public.public_profiles, public.friendships,
--                  sandbox_projects (visibility = 'friends'),
--                  public.project_likes, public.project_comments
-- ==============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ==============================================================================
-- 1. Handle @username em public.profiles (sem expor email/role publicamente)
-- ==============================================================================
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS username VARCHAR(30);

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
  v_reserved CONSTANT TEXT[] := ARRAY[
    'admin',
    'codit',
    'octopy',
    'suporte',
    'support',
    'sistema',
    'system',
    'api',
    'auth',
    'conta',
    'comunidade',
    'perfil',
    'offline'
  ];
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

  IF v_clean = ANY(v_reserved) THEN
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
    ) AND lower(v_candidate) <> ALL(v_reserved);

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

DO $$
DECLARE
  r RECORD;
  v_generated VARCHAR(30);
BEGIN
  FOR r IN
    SELECT id, email, full_name
    FROM public.profiles
    WHERE username IS NULL OR btrim(username) = ''
    ORDER BY created_at ASC, id ASC
  LOOP
    v_generated := public.generate_unique_username(
      COALESCE(NULLIF(btrim(r.full_name), ''), NULLIF(split_part(r.email, '@', 1), ''), 'codit'),
      r.id
    );
    UPDATE public.profiles
    SET username = v_generated
    WHERE id = r.id;
  END LOOP;
END;
$$;

ALTER TABLE public.profiles
  ALTER COLUMN username SET NOT NULL;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS chk_profiles_username_format;

ALTER TABLE public.profiles
  ADD CONSTRAINT chk_profiles_username_format CHECK (
    username ~ '^[a-z0-9](?:[a-z0-9._]{1,28}[a-z0-9])$'
    AND username !~ '[._]{2}'
  );

CREATE UNIQUE INDEX IF NOT EXISTS uq_profiles_username_lower
  ON public.profiles (lower(username));

CREATE OR REPLACE FUNCTION public.normalize_profile_username()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_normalized TEXT;
  v_reserved CONSTANT TEXT[] := ARRAY[
    'admin',
    'codit',
    'octopy',
    'suporte',
    'support',
    'sistema',
    'system',
    'api',
    'auth',
    'conta',
    'comunidade',
    'perfil',
    'offline'
  ];
BEGIN
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
      RETURN NEW;
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.username IS NULL OR btrim(NEW.username) = '' THEN
      NEW.username := OLD.username;
      RETURN NEW;
    END IF;
  END IF;

  v_normalized := lower(regexp_replace(btrim(NEW.username), '^@+', ''));
  IF v_normalized = ANY(v_reserved) THEN
    RAISE EXCEPTION 'Este @usuário é reservado pelo Codit.'
      USING ERRCODE = '23514';
  END IF;

  NEW.username := v_normalized;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_normalize_username ON public.profiles;
CREATE TRIGGER trg_profiles_normalize_username
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.normalize_profile_username();

-- Atualizar provisionamento automático de perfil ao cadastrar usuário em auth.users
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
  v_reserved CONSTANT TEXT[] := ARRAY[
    'admin',
    'codit',
    'octopy',
    'suporte',
    'support',
    'sistema',
    'system',
    'api',
    'auth',
    'conta',
    'comunidade',
    'perfil',
    'offline'
  ];
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
     AND v_raw_username <> ALL(v_reserved)
     AND NOT EXISTS (
       SELECT 1
       FROM public.profiles p
       WHERE lower(p.username) = v_raw_username
     ) THEN
    v_username := v_raw_username;
  ELSE
    v_username := public.generate_unique_username(
      COALESCE(v_raw_name, v_fallback_name, 'codit'),
      NEW.id
    );
  END IF;

  INSERT INTO public.profiles (id, email, full_name, username, avatar_url, role)
  VALUES (NEW.id, v_email, v_full_name, v_username, v_avatar_url, 'student')
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

-- ==============================================================================
-- 2. Diretório público livre de PII: public.public_profiles
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.public_profiles (
  id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  username VARCHAR(30) NOT NULL,
  full_name VARCHAR(120) NOT NULL DEFAULT '',
  avatar_url TEXT,
  bio TEXT,
  github_username VARCHAR(60),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_public_profiles_username_lower
  ON public.public_profiles (lower(username));

CREATE INDEX IF NOT EXISTS idx_public_profiles_username_prefix
  ON public.public_profiles (lower(username) text_pattern_ops);

CREATE INDEX IF NOT EXISTS idx_public_profiles_full_name_lower
  ON public.public_profiles (lower(full_name));

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
    NEW.created_at,
    NEW.updated_at
  )
  ON CONFLICT (id) DO UPDATE SET
    username = EXCLUDED.username,
    full_name = EXCLUDED.full_name,
    avatar_url = EXCLUDED.avatar_url,
    bio = EXCLUDED.bio,
    github_username = EXCLUDED.github_username,
    updated_at = EXCLUDED.updated_at;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_sync_public_profile ON public.profiles;
CREATE TRIGGER trg_profiles_sync_public_profile
  AFTER INSERT OR UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_public_profile();

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

ALTER TABLE public.public_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS public_profiles_select_all ON public.public_profiles;
CREATE POLICY public_profiles_select_all
  ON public.public_profiles
  FOR SELECT
  TO anon, authenticated
  USING (TRUE);

-- ==============================================================================
-- 3. Tabela public.friendships + funções auxiliares seguras
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.friendships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id UUID NOT NULL
    CONSTRAINT fk_friendships_requester_id REFERENCES public.profiles(id) ON DELETE CASCADE,
  addressee_id UUID NOT NULL
    CONSTRAINT fk_friendships_addressee_id REFERENCES public.profiles(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CONSTRAINT chk_friendships_status CHECK (status IN ('pending', 'accepted')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  accepted_at TIMESTAMPTZ,
  CONSTRAINT chk_friendships_no_self CHECK (requester_id <> addressee_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_friendships_user_pair
  ON public.friendships (LEAST(requester_id, addressee_id), GREATEST(requester_id, addressee_id));

CREATE INDEX IF NOT EXISTS idx_friendships_requester_status
  ON public.friendships (requester_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_friendships_addressee_status
  ON public.friendships (addressee_id, status, updated_at DESC);

CREATE OR REPLACE FUNCTION public.guard_friendship_update()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.requester_id IS DISTINCT FROM OLD.requester_id
     OR NEW.addressee_id IS DISTINCT FROM OLD.addressee_id THEN
    RAISE EXCEPTION 'Não é permitido alterar os participantes de uma amizade.';
  END IF;

  IF OLD.status = 'accepted' AND NEW.status <> 'accepted' THEN
    RAISE EXCEPTION 'Não é permitido reverter uma amizade aceita para pendente.';
  END IF;

  IF NEW.status = 'accepted' THEN
    NEW.accepted_at := COALESCE(OLD.accepted_at, NOW());
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_friendships_guard_update ON public.friendships;
CREATE TRIGGER trg_friendships_guard_update
  BEFORE UPDATE ON public.friendships
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_friendship_update();

DROP TRIGGER IF EXISTS trg_friendships_set_updated_at ON public.friendships;
CREATE TRIGGER trg_friendships_set_updated_at
  BEFORE UPDATE ON public.friendships
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.friendships ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS friendships_select_participants ON public.friendships;
CREATE POLICY friendships_select_participants
  ON public.friendships
  FOR SELECT
  TO authenticated
  USING (auth.uid() = requester_id OR auth.uid() = addressee_id);

DROP POLICY IF EXISTS friendships_insert_requester ON public.friendships;
CREATE POLICY friendships_insert_requester
  ON public.friendships
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = requester_id
    AND requester_id <> addressee_id
    AND status = 'pending'
  );

DROP POLICY IF EXISTS friendships_update_accept_addressee ON public.friendships;
CREATE POLICY friendships_update_accept_addressee
  ON public.friendships
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = addressee_id AND status = 'pending')
  WITH CHECK (auth.uid() = addressee_id AND status = 'accepted');

DROP POLICY IF EXISTS friendships_delete_participants ON public.friendships;
CREATE POLICY friendships_delete_participants
  ON public.friendships
  FOR DELETE
  TO authenticated
  USING (auth.uid() = requester_id OR auth.uid() = addressee_id);

CREATE OR REPLACE FUNCTION public.is_friend_with_current_user(target_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    auth.uid() IS NOT NULL
    AND target_user_id IS NOT NULL
    AND auth.uid() <> target_user_id
    AND EXISTS (
      SELECT 1
      FROM public.friendships f
      WHERE LEAST(f.requester_id, f.addressee_id) = LEAST(auth.uid(), target_user_id)
        AND GREATEST(f.requester_id, f.addressee_id) = GREATEST(auth.uid(), target_user_id)
        AND f.status = 'accepted'
    );
$$;

CREATE OR REPLACE FUNCTION public.get_profile_friend_count(p_user_id UUID)
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::INTEGER
  FROM public.friendships f
  WHERE (f.requester_id = p_user_id OR f.addressee_id = p_user_id)
    AND f.status = 'accepted';
$$;

GRANT EXECUTE ON FUNCTION public.get_profile_friend_count(UUID) TO anon, authenticated;

-- ==============================================================================
-- 4. Visibilidade 'friends' em public.sandbox_projects + can_view_sandbox_project
-- ==============================================================================
ALTER TABLE public.sandbox_projects
  DROP CONSTRAINT IF EXISTS chk_sandbox_projects_visibility;

ALTER TABLE public.sandbox_projects
  ADD CONSTRAINT chk_sandbox_projects_visibility CHECK (
    visibility IN ('private', 'friends', 'unlisted', 'public_portfolio')
  );

DROP POLICY IF EXISTS sandbox_projects_select_friends ON public.sandbox_projects;
CREATE POLICY sandbox_projects_select_friends
  ON public.sandbox_projects
  FOR SELECT
  TO authenticated
  USING (
    visibility = 'friends'
    AND deleted_at IS NULL
    AND public.is_friend_with_current_user(user_id)
  );

CREATE INDEX IF NOT EXISTS idx_sandbox_projects_social_feed
  ON public.sandbox_projects (visibility, updated_at DESC)
  WHERE deleted_at IS NULL AND visibility IN ('public_portfolio', 'friends');

CREATE OR REPLACE FUNCTION public.can_view_sandbox_project(p_project_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.sandbox_projects sp
    WHERE sp.id = p_project_id
      AND sp.deleted_at IS NULL
      AND (
        sp.visibility = 'public_portfolio'
        OR sp.user_id = auth.uid()
        OR (
          sp.visibility = 'friends'
          AND public.is_friend_with_current_user(sp.user_id)
        )
      )
  );
$$;

-- ==============================================================================
-- 5. Interações em projetos: public.project_likes e public.project_comments
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.project_likes (
  project_id UUID NOT NULL
    CONSTRAINT fk_project_likes_project_id REFERENCES public.sandbox_projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL
    CONSTRAINT fk_project_likes_user_id REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT pk_project_likes PRIMARY KEY (project_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_project_likes_user_created
  ON public.project_likes (user_id, created_at DESC);

ALTER TABLE public.project_likes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS project_likes_select_visible ON public.project_likes;
CREATE POLICY project_likes_select_visible
  ON public.project_likes
  FOR SELECT
  TO anon, authenticated
  USING (public.can_view_sandbox_project(project_id));

DROP POLICY IF EXISTS project_likes_insert_own ON public.project_likes;
CREATE POLICY project_likes_insert_own
  ON public.project_likes
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND public.can_view_sandbox_project(project_id)
  );

DROP POLICY IF EXISTS project_likes_delete_own ON public.project_likes;
CREATE POLICY project_likes_delete_own
  ON public.project_likes
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.project_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL
    CONSTRAINT fk_project_comments_project_id REFERENCES public.sandbox_projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL
    CONSTRAINT fk_project_comments_user_id REFERENCES public.profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL
    CONSTRAINT chk_project_comments_content CHECK (char_length(btrim(content)) BETWEEN 1 AND 500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_project_comments_project_created
  ON public.project_comments (project_id, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_project_comments_user_id
  ON public.project_comments (user_id);

DROP TRIGGER IF EXISTS trg_project_comments_set_updated_at ON public.project_comments;
CREATE TRIGGER trg_project_comments_set_updated_at
  BEFORE UPDATE ON public.project_comments
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.project_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS project_comments_select_visible ON public.project_comments;
CREATE POLICY project_comments_select_visible
  ON public.project_comments
  FOR SELECT
  TO anon, authenticated
  USING (public.can_view_sandbox_project(project_id));

DROP POLICY IF EXISTS project_comments_insert_own ON public.project_comments;
CREATE POLICY project_comments_insert_own
  ON public.project_comments
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND public.can_view_sandbox_project(project_id)
  );

DROP POLICY IF EXISTS project_comments_delete_author_or_owner ON public.project_comments;
CREATE POLICY project_comments_delete_author_or_owner
  ON public.project_comments
  FOR DELETE
  TO authenticated
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1
      FROM public.sandbox_projects sp
      WHERE sp.id = project_id
        AND sp.user_id = auth.uid()
    )
  );
