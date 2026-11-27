-- ==============================================================================
-- Codit (TCC-Codit) — Fase 3: Chat Rico, Reações, Moderação & Conformidade LGPD
-- ==============================================================================
-- 1. Chat rico: metadata_json + tipos ('code', 'image', 'project_share'),
--    bucket privado `chat-attachments` (5 MB, imagens), `chat_message_reactions`
--    (6 reações) e RPC `search_conversation_messages`.
-- 2. Indicadores sociais: `last_seen_at` em profiles/public_profiles + RPC
--    `touch_last_seen()`.
-- 3. Moderação: `user_blocks` (bloqueio bilateral cortando amizade/DM/chamada
--    e visualização/interação em projetos) + `moderation_reports`.
-- 4. LGPD: `terms_accepted_at` e `privacy_version` em profiles, RPCs
--    `accept_privacy_terms`, `export_my_account_data` e `delete_my_account`.
-- ==============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ==============================================================================
-- 1. Colunas em profiles / public_profiles (LGPD + visto por último)
-- ==============================================================================
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS privacy_version VARCHAR(24),
  ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;

ALTER TABLE public.public_profiles
  ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;

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
    last_seen_at,
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
    NEW.last_seen_at,
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
    last_seen_at = EXCLUDED.last_seen_at,
    updated_at = EXCLUDED.updated_at;

  RETURN NEW;
END;
$$;

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
  v_terms_accepted_at TIMESTAMPTZ;
  v_privacy_version VARCHAR(24);
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

  IF COALESCE(NEW.raw_user_meta_data->>'terms_accepted', '') = 'true' THEN
    v_terms_accepted_at := NOW();
    v_privacy_version := left(
      COALESCE(NULLIF(btrim(NEW.raw_user_meta_data->>'privacy_version'), ''), '2026-11'),
      24
    );
  ELSE
    v_terms_accepted_at := NULL;
    v_privacy_version := NULL;
  END IF;

  INSERT INTO public.profiles (
    id,
    email,
    full_name,
    username,
    username_changed_at,
    avatar_url,
    role,
    terms_accepted_at,
    privacy_version,
    last_seen_at
  )
  VALUES (
    NEW.id,
    v_email,
    v_full_name,
    v_username,
    v_changed_at,
    v_avatar_url,
    'student',
    v_terms_accepted_at,
    v_privacy_version,
    NOW()
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = CASE
      WHEN btrim(public.profiles.full_name) = '' THEN EXCLUDED.full_name
      ELSE public.profiles.full_name
    END,
    avatar_url = COALESCE(public.profiles.avatar_url, EXCLUDED.avatar_url),
    terms_accepted_at = COALESCE(public.profiles.terms_accepted_at, EXCLUDED.terms_accepted_at),
    privacy_version = COALESCE(public.profiles.privacy_version, EXCLUDED.privacy_version),
    updated_at = NOW();

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.touch_last_seen()
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_now TIMESTAMPTZ := NOW();
BEGIN
  IF v_actor IS NULL THEN
    RETURN NULL;
  END IF;

  UPDATE public.profiles
  SET last_seen_at = v_now
  WHERE id = v_actor
    AND (last_seen_at IS NULL OR last_seen_at < v_now - INTERVAL '45 seconds');

  RETURN v_now;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.touch_last_seen() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.touch_last_seen() TO authenticated;

-- ==============================================================================
-- 2. Moderação: public.user_blocks e public.moderation_reports
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.user_blocks (
  blocker_id UUID NOT NULL
    CONSTRAINT fk_user_blocks_blocker_id REFERENCES public.profiles(id) ON DELETE CASCADE,
  blocked_id UUID NOT NULL
    CONSTRAINT fk_user_blocks_blocked_id REFERENCES public.profiles(id) ON DELETE CASCADE,
  reason VARCHAR(200),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT pk_user_blocks PRIMARY KEY (blocker_id, blocked_id),
  CONSTRAINT chk_user_blocks_no_self CHECK (blocker_id <> blocked_id)
);

CREATE INDEX IF NOT EXISTS idx_user_blocks_blocker
  ON public.user_blocks (blocker_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_blocks_blocked
  ON public.user_blocks (blocked_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.are_users_blocked(
  p_user_a UUID,
  p_user_b UUID
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p_user_a IS NOT NULL
    AND p_user_b IS NOT NULL
    AND p_user_a <> p_user_b
    AND (
      COALESCE(auth.role(), '') = 'service_role'
      OR (
        auth.uid() IS NULL
        AND session_user IN ('postgres', 'supabase_admin')
      )
      OR (
        auth.uid() IS NOT NULL
        AND (auth.uid() = p_user_a OR auth.uid() = p_user_b)
      )
    )
    AND EXISTS (
      SELECT 1
      FROM public.user_blocks b
      WHERE (b.blocker_id = p_user_a AND b.blocked_id = p_user_b)
         OR (b.blocker_id = p_user_b AND b.blocked_id = p_user_a)
    );
$$;

CREATE OR REPLACE FUNCTION public.on_user_block_inserted()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.friendships f
  WHERE LEAST(f.requester_id, f.addressee_id) = LEAST(NEW.blocker_id, NEW.blocked_id)
    AND GREATEST(f.requester_id, f.addressee_id) = GREATEST(NEW.blocker_id, NEW.blocked_id);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_user_blocks_after_insert ON public.user_blocks;
CREATE TRIGGER trg_user_blocks_after_insert
  AFTER INSERT ON public.user_blocks
  FOR EACH ROW
  EXECUTE FUNCTION public.on_user_block_inserted();

ALTER TABLE public.user_blocks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_blocks_select_own ON public.user_blocks;
CREATE POLICY user_blocks_select_own
  ON public.user_blocks
  FOR SELECT
  TO authenticated
  USING (auth.uid() = blocker_id);

DROP POLICY IF EXISTS user_blocks_insert_own ON public.user_blocks;
CREATE POLICY user_blocks_insert_own
  ON public.user_blocks
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = blocker_id
    AND blocker_id <> blocked_id
  );

DROP POLICY IF EXISTS user_blocks_delete_own ON public.user_blocks;
CREATE POLICY user_blocks_delete_own
  ON public.user_blocks
  FOR DELETE
  TO authenticated
  USING (auth.uid() = blocker_id);

REVOKE ALL ON TABLE public.user_blocks FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON TABLE public.user_blocks TO authenticated;

REVOKE EXECUTE ON FUNCTION public.are_users_blocked(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.are_users_blocked(UUID, UUID) TO authenticated;

-- Atualiza helpers sociais/chat para respeitar bloqueio bilateral
CREATE OR REPLACE FUNCTION public.are_users_friends(
  p_user_a UUID,
  p_user_b UUID
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p_user_a IS NOT NULL
    AND p_user_b IS NOT NULL
    AND p_user_a <> p_user_b
    AND (
      COALESCE(auth.role(), '') = 'service_role'
      OR (
        auth.uid() IS NULL
        AND session_user IN ('postgres', 'supabase_admin')
      )
      OR (
        auth.uid() IS NOT NULL
        AND (auth.uid() = p_user_a OR auth.uid() = p_user_b)
      )
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.user_blocks b
      WHERE (b.blocker_id = p_user_a AND b.blocked_id = p_user_b)
         OR (b.blocker_id = p_user_b AND b.blocked_id = p_user_a)
    )
    AND EXISTS (
      SELECT 1
      FROM public.friendships f
      WHERE LEAST(f.requester_id, f.addressee_id) = LEAST(p_user_a, p_user_b)
        AND GREATEST(f.requester_id, f.addressee_id) = GREATEST(p_user_a, p_user_b)
        AND f.status = 'accepted'
    );
$$;

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
    AND NOT EXISTS (
      SELECT 1
      FROM public.user_blocks b
      WHERE (b.blocker_id = auth.uid() AND b.blocked_id = target_user_id)
         OR (b.blocker_id = target_user_id AND b.blocked_id = auth.uid())
    )
    AND EXISTS (
      SELECT 1
      FROM public.friendships f
      WHERE LEAST(f.requester_id, f.addressee_id) = LEAST(auth.uid(), target_user_id)
        AND GREATEST(f.requester_id, f.addressee_id) = GREATEST(auth.uid(), target_user_id)
        AND f.status = 'accepted'
    );
$$;

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
        auth.uid() IS NULL
        OR NOT EXISTS (
          SELECT 1
          FROM public.user_blocks b
          WHERE (b.blocker_id = auth.uid() AND b.blocked_id = sp.user_id)
             OR (b.blocker_id = sp.user_id AND b.blocked_id = auth.uid())
        )
      )
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

DROP POLICY IF EXISTS friendships_insert_requester ON public.friendships;
CREATE POLICY friendships_insert_requester
  ON public.friendships
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = requester_id
    AND requester_id <> addressee_id
    AND status = 'pending'
    AND NOT public.are_users_blocked(requester_id, addressee_id)
  );

CREATE OR REPLACE FUNCTION public.can_send_chat_message(
  p_conversation_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_kind VARCHAR(16);
  v_other_id UUID;
  v_active_count INTEGER;
BEGIN
  IF v_user_id IS NULL OR p_conversation_id IS NULL THEN
    RETURN FALSE;
  END IF;

  IF NOT public.is_active_chat_member(p_conversation_id, v_user_id) THEN
    RETURN FALSE;
  END IF;

  SELECT c.kind
  INTO v_kind
  FROM public.chat_conversations c
  WHERE c.id = p_conversation_id;

  IF v_kind IS NULL THEN
    RETURN FALSE;
  END IF;

  IF v_kind = 'direct' THEN
    SELECT m.user_id
    INTO v_other_id
    FROM public.chat_conversation_members m
    WHERE m.conversation_id = p_conversation_id
      AND m.user_id <> v_user_id
      AND m.left_at IS NULL
    LIMIT 1;

    IF v_other_id IS NULL THEN
      RETURN FALSE;
    END IF;

    IF public.are_users_blocked(v_user_id, v_other_id) THEN
      RETURN FALSE;
    END IF;

    RETURN public.are_users_friends(v_user_id, v_other_id);
  END IF;

  SELECT COUNT(*)::INTEGER
  INTO v_active_count
  FROM public.chat_conversation_members m
  WHERE m.conversation_id = p_conversation_id
    AND m.left_at IS NULL;

  RETURN v_active_count BETWEEN 1 AND 10;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_or_create_direct_conversation(
  p_friend_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_pair_key TEXT;
  v_conversation_id UUID;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Autenticação obrigatória para iniciar conversa.'
      USING ERRCODE = '42501';
  END IF;

  IF p_friend_id IS NULL OR p_friend_id = v_actor THEN
    RAISE EXCEPTION 'Selecione um amigo válido para conversar.'
      USING ERRCODE = '22023';
  END IF;

  IF public.are_users_blocked(v_actor, p_friend_id) THEN
    RAISE EXCEPTION 'USER_BLOCKED'
      USING ERRCODE = 'P0001',
            DETAIL = 'Não é possível iniciar conversa com um usuário bloqueado.';
  END IF;

  IF NOT public.are_users_friends(v_actor, p_friend_id) THEN
    RAISE EXCEPTION 'CHAT_NOT_FRIENDS'
      USING ERRCODE = 'P0001',
            DETAIL = 'Apenas amigos aceitos podem enviar mensagens diretas no Codit.';
  END IF;

  PERFORM set_config('codit.chat_rpc', '1', true);

  v_pair_key := LEAST(v_actor, p_friend_id)::TEXT || ':' || GREATEST(v_actor, p_friend_id)::TEXT;

  INSERT INTO public.chat_conversations (kind, title, created_by, direct_pair_key)
  VALUES ('direct', NULL, v_actor, v_pair_key)
  ON CONFLICT (direct_pair_key) WHERE direct_pair_key IS NOT NULL
  DO UPDATE SET updated_at = NOW()
  RETURNING id INTO v_conversation_id;

  INSERT INTO public.chat_conversation_members (conversation_id, user_id, role, added_by, left_at)
  VALUES
    (v_conversation_id, v_actor, 'member', v_actor, NULL),
    (v_conversation_id, p_friend_id, 'member', v_actor, NULL)
  ON CONFLICT (conversation_id, user_id)
  DO UPDATE SET
    left_at = NULL,
    updated_at = NOW();

  RETURN v_conversation_id;
END;
$$;

CREATE TABLE IF NOT EXISTS public.moderation_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id UUID NOT NULL
    CONSTRAINT fk_moderation_reports_reporter_id REFERENCES public.profiles(id) ON DELETE CASCADE,
  target_type VARCHAR(24) NOT NULL
    CONSTRAINT chk_moderation_reports_target_type CHECK (target_type IN ('user', 'project', 'message')),
  target_id UUID NOT NULL,
  reason VARCHAR(40) NOT NULL
    CONSTRAINT chk_moderation_reports_reason CHECK (
      reason IN ('spam', 'harassment', 'inappropriate_content', 'impersonation', 'copyright', 'other')
    ),
  details TEXT
    CONSTRAINT chk_moderation_reports_details CHECK (details IS NULL OR char_length(btrim(details)) <= 1000),
  status VARCHAR(24) NOT NULL DEFAULT 'open'
    CONSTRAINT chk_moderation_reports_status CHECK (status IN ('open', 'reviewing', 'resolved', 'dismissed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_moderation_reports_reporter
  ON public.moderation_reports (reporter_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_moderation_reports_target
  ON public.moderation_reports (target_type, target_id, created_at DESC);

DROP TRIGGER IF EXISTS trg_moderation_reports_set_updated_at ON public.moderation_reports;
CREATE TRIGGER trg_moderation_reports_set_updated_at
  BEFORE UPDATE ON public.moderation_reports
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.moderation_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS moderation_reports_select_own ON public.moderation_reports;
CREATE POLICY moderation_reports_select_own
  ON public.moderation_reports
  FOR SELECT
  TO authenticated
  USING (auth.uid() = reporter_id);

DROP POLICY IF EXISTS moderation_reports_insert_own ON public.moderation_reports;
CREATE POLICY moderation_reports_insert_own
  ON public.moderation_reports
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = reporter_id
    AND status = 'open'
  );

REVOKE ALL ON TABLE public.moderation_reports FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.moderation_reports TO authenticated;

-- ==============================================================================
-- 3. Chat rico: metadata_json, tipos, reações, busca textual e Storage
-- ==============================================================================
ALTER TABLE public.chat_messages
  ADD COLUMN IF NOT EXISTS metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.chat_messages
  DROP CONSTRAINT IF EXISTS chk_chat_messages_type;

ALTER TABLE public.chat_messages
  ADD CONSTRAINT chk_chat_messages_type CHECK (
    message_type IN ('text', 'system', 'code', 'image', 'project_share')
  );

ALTER TABLE public.chat_messages
  DROP CONSTRAINT IF EXISTS chk_chat_messages_content;

ALTER TABLE public.chat_messages
  ADD CONSTRAINT chk_chat_messages_content CHECK (
    (message_type = 'code' AND char_length(btrim(content)) BETWEEN 1 AND 8000)
    OR (message_type <> 'code' AND char_length(btrim(content)) BETWEEN 1 AND 2000)
  );

CREATE OR REPLACE FUNCTION public.guard_chat_message_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.conversation_id IS DISTINCT FROM OLD.conversation_id
     OR NEW.sender_id IS DISTINCT FROM OLD.sender_id
     OR NEW.message_type IS DISTINCT FROM OLD.message_type
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Metadados imutáveis da mensagem não podem ser alterados.'
      USING ERRCODE = 'P0001';
  END IF;

  IF OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL THEN
    RAISE EXCEPTION 'Não é permitido restaurar uma mensagem excluída.'
      USING ERRCODE = 'P0001';
  END IF;

  IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
    NEW.content := '[Mensagem removida]';
    NEW.metadata_json := '{}'::jsonb;
    RETURN NEW;
  END IF;

  IF OLD.deleted_at IS NOT NULL
     AND NEW.deleted_at IS NOT NULL
     AND NEW.content = '[Mensagem removida]'
     AND (
       COALESCE(auth.role(), '') = 'service_role'
       OR current_user IN ('postgres', 'supabase_admin')
     ) THEN
    RETURN NEW;
  END IF;

  IF NEW.content IS DISTINCT FROM OLD.content
     OR NEW.metadata_json IS DISTINCT FROM OLD.metadata_json THEN
    RAISE EXCEPTION 'Conteúdo da mensagem não pode ser alterado.'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.on_chat_message_inserted()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_preview TEXT;
BEGIN
  PERFORM set_config('codit.chat_rpc', '1', true);

  v_preview := CASE NEW.message_type
    WHEN 'code' THEN '[Código] ' || left(btrim(NEW.content), 140)
    WHEN 'image' THEN '[Imagem] ' || left(btrim(NEW.content), 140)
    WHEN 'project_share' THEN '[Projeto] ' || left(btrim(NEW.content), 140)
    ELSE left(btrim(NEW.content), 160)
  END;

  UPDATE public.chat_conversations
  SET
    last_message_at = NEW.created_at,
    last_message_preview = left(v_preview, 160),
    updated_at = NOW()
  WHERE id = NEW.conversation_id;

  IF NEW.message_type IN ('text', 'code', 'image', 'project_share') THEN
    UPDATE public.chat_conversation_members
    SET last_read_at = GREATEST(last_read_at, NEW.created_at)
    WHERE conversation_id = NEW.conversation_id
      AND user_id = NEW.sender_id
      AND left_at IS NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP POLICY IF EXISTS chat_messages_insert_member ON public.chat_messages;
CREATE POLICY chat_messages_insert_member
  ON public.chat_messages
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = sender_id
    AND message_type IN ('text', 'code', 'image', 'project_share')
    AND public.can_send_chat_message(conversation_id)
  );

-- Tabela de reações rápidas (6 reações)
CREATE TABLE IF NOT EXISTS public.chat_message_reactions (
  message_id UUID NOT NULL
    CONSTRAINT fk_chat_message_reactions_message_id REFERENCES public.chat_messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL
    CONSTRAINT fk_chat_message_reactions_user_id REFERENCES public.profiles(id) ON DELETE CASCADE,
  emoji VARCHAR(16) NOT NULL
    CONSTRAINT chk_chat_message_reactions_emoji CHECK (
      emoji IN ('👍', '❤️', '🔥', '😂', '🚀', '👀')
    ),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT pk_chat_message_reactions PRIMARY KEY (message_id, user_id, emoji)
);

CREATE INDEX IF NOT EXISTS idx_chat_message_reactions_message
  ON public.chat_message_reactions (message_id, created_at ASC);

ALTER TABLE public.chat_message_reactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS chat_message_reactions_select_member ON public.chat_message_reactions;
CREATE POLICY chat_message_reactions_select_member
  ON public.chat_message_reactions
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.chat_messages m
      WHERE m.id = chat_message_reactions.message_id
        AND public.is_active_chat_member(m.conversation_id)
    )
  );

DROP POLICY IF EXISTS chat_message_reactions_insert_member ON public.chat_message_reactions;
CREATE POLICY chat_message_reactions_insert_member
  ON public.chat_message_reactions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1
      FROM public.chat_messages m
      WHERE m.id = chat_message_reactions.message_id
        AND m.deleted_at IS NULL
        AND public.can_send_chat_message(m.conversation_id)
    )
  );

DROP POLICY IF EXISTS chat_message_reactions_delete_own ON public.chat_message_reactions;
CREATE POLICY chat_message_reactions_delete_own
  ON public.chat_message_reactions
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

REVOKE ALL ON TABLE public.chat_message_reactions FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON TABLE public.chat_message_reactions TO authenticated;

-- RPC de busca textual dentro da conversa
CREATE OR REPLACE FUNCTION public.search_conversation_messages(
  p_conversation_id UUID,
  p_query TEXT,
  p_limit INTEGER DEFAULT 30
)
RETURNS SETOF public.chat_messages
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_clean TEXT;
  v_escaped TEXT;
  v_limit INTEGER;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Autenticação obrigatória.'
      USING ERRCODE = '42501';
  END IF;

  IF p_conversation_id IS NULL OR NOT public.is_active_chat_member(p_conversation_id, v_actor) THEN
    RAISE EXCEPTION 'Você não tem permissão para pesquisar nesta conversa.'
      USING ERRCODE = '42501';
  END IF;

  v_clean := btrim(COALESCE(p_query, ''));
  IF char_length(v_clean) < 1 THEN
    RETURN;
  END IF;

  v_escaped := replace(replace(replace(v_clean, '\', '\\'), '%', '\%'), '_', '\_');
  v_limit := LEAST(GREATEST(COALESCE(p_limit, 30), 1), 100);

  RETURN QUERY
  SELECT m.*
  FROM public.chat_messages m
  WHERE m.conversation_id = p_conversation_id
    AND m.deleted_at IS NULL
    AND m.content ILIKE ('%' || v_escaped || '%') ESCAPE '\'
  ORDER BY m.created_at DESC
  LIMIT v_limit;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.search_conversation_messages(UUID, TEXT, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_conversation_messages(UUID, TEXT, INTEGER) TO authenticated;

-- Bucket privado de anexos/imagens do chat (5 MB, imagens permitidas)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'storage'
      AND table_name = 'buckets'
  ) THEN
    INSERT INTO storage.buckets (
      id,
      name,
      public,
      file_size_limit,
      allowed_mime_types
    )
    VALUES (
      'chat-attachments',
      'chat-attachments',
      FALSE,
      5242880,
      ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/gif']
    )
    ON CONFLICT (id) DO UPDATE SET
      public = FALSE,
      file_size_limit = 5242880,
      allowed_mime_types = ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
  END IF;
END;
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'storage'
      AND table_name = 'objects'
  ) THEN
    EXECUTE 'DROP POLICY IF EXISTS chat_attachments_select_member ON storage.objects';
    EXECUTE $pol$
      CREATE POLICY chat_attachments_select_member
        ON storage.objects
        FOR SELECT
        TO authenticated
        USING (
          bucket_id = 'chat-attachments'
          AND (storage.foldername(name))[1] ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
          AND public.is_active_chat_member(((storage.foldername(name))[1])::uuid)
        )
    $pol$;

    EXECUTE 'DROP POLICY IF EXISTS chat_attachments_insert_member ON storage.objects';
    EXECUTE $pol$
      CREATE POLICY chat_attachments_insert_member
        ON storage.objects
        FOR INSERT
        TO authenticated
        WITH CHECK (
          bucket_id = 'chat-attachments'
          AND (storage.foldername(name))[1] ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
          AND public.can_send_chat_message(((storage.foldername(name))[1])::uuid)
        )
    $pol$;
  END IF;
END;
$$;

-- ==============================================================================
-- 4. Conformidade LGPD: aceite de termos, exportação JSON e exclusão definitiva
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.accept_privacy_terms(
  p_version TEXT DEFAULT '2026-11'
)
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_now TIMESTAMPTZ := NOW();
  v_version VARCHAR(24);
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Autenticação obrigatória.'
      USING ERRCODE = '42501';
  END IF;

  v_version := left(COALESCE(NULLIF(btrim(p_version), ''), '2026-11'), 24);

  UPDATE public.profiles
  SET
    terms_accepted_at = COALESCE(terms_accepted_at, v_now),
    privacy_version = v_version,
    updated_at = v_now
  WHERE id = v_actor;

  RETURN v_now;
END;
$$;

CREATE OR REPLACE FUNCTION public.export_my_account_data()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_profile JSONB;
  v_projects JSONB;
  v_friendships JSONB;
  v_blocks JSONB;
  v_reports JSONB;
  v_messages JSONB;
  v_notifications JSONB;
  v_lesson_progress JSONB;
  v_submissions JSONB;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Autenticação obrigatória para exportar dados.'
      USING ERRCODE = '42501';
  END IF;

  SELECT to_jsonb(p)
  INTO v_profile
  FROM public.profiles p
  WHERE p.id = v_actor;

  SELECT COALESCE(jsonb_agg(to_jsonb(sp) ORDER BY sp.updated_at DESC), '[]'::jsonb)
  INTO v_projects
  FROM public.sandbox_projects sp
  WHERE sp.user_id = v_actor;

  SELECT COALESCE(jsonb_agg(to_jsonb(f) ORDER BY f.created_at DESC), '[]'::jsonb)
  INTO v_friendships
  FROM public.friendships f
  WHERE f.requester_id = v_actor OR f.addressee_id = v_actor;

  SELECT COALESCE(jsonb_agg(to_jsonb(b) ORDER BY b.created_at DESC), '[]'::jsonb)
  INTO v_blocks
  FROM public.user_blocks b
  WHERE b.blocker_id = v_actor;

  SELECT COALESCE(jsonb_agg(to_jsonb(r) ORDER BY r.created_at DESC), '[]'::jsonb)
  INTO v_reports
  FROM public.moderation_reports r
  WHERE r.reporter_id = v_actor;

  SELECT COALESCE(jsonb_agg(to_jsonb(m) ORDER BY m.created_at DESC), '[]'::jsonb)
  INTO v_messages
  FROM public.chat_messages m
  WHERE m.sender_id = v_actor
    AND m.deleted_at IS NULL;

  SELECT COALESCE(jsonb_agg(to_jsonb(n) ORDER BY n.created_at DESC), '[]'::jsonb)
  INTO v_notifications
  FROM public.notifications n
  WHERE n.recipient_id = v_actor;

  SELECT COALESCE(jsonb_agg(to_jsonb(lp) ORDER BY lp.updated_at DESC), '[]'::jsonb)
  INTO v_lesson_progress
  FROM public.user_lesson_progress lp
  WHERE lp.user_id = v_actor;

  SELECT COALESCE(jsonb_agg(to_jsonb(es) ORDER BY es.created_at DESC), '[]'::jsonb)
  INTO v_submissions
  FROM public.exercise_submissions es
  WHERE es.user_id = v_actor;

  RETURN jsonb_build_object(
    'exported_at', NOW(),
    'schema_version', '2026-11',
    'profile', COALESCE(v_profile, '{}'::jsonb),
    'sandbox_projects', v_projects,
    'friendships', v_friendships,
    'user_blocks', v_blocks,
    'moderation_reports', v_reports,
    'chat_messages', v_messages,
    'notifications', v_notifications,
    'lesson_progress', v_lesson_progress,
    'exercise_submissions', v_submissions
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_my_account(
  p_confirm_username TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_expected_username TEXT;
  v_normalized_input TEXT;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Autenticação obrigatória para excluir conta.'
      USING ERRCODE = '42501';
  END IF;

  SELECT lower(p.username)
  INTO v_expected_username
  FROM public.profiles p
  WHERE p.id = v_actor;

  IF v_expected_username IS NULL THEN
    RAISE EXCEPTION 'Perfil da conta não encontrado.'
      USING ERRCODE = 'P0001';
  END IF;

  v_normalized_input := lower(
    regexp_replace(btrim(COALESCE(p_confirm_username, '')), '^@+', '')
  );

  IF v_normalized_input <> v_expected_username THEN
    RAISE EXCEPTION 'CONFIRM_USERNAME_MISMATCH'
      USING ERRCODE = 'P0001',
            DETAIL = 'O @usuário digitado não corresponde à sua conta.';
  END IF;

  DELETE FROM public.push_devices WHERE user_id = v_actor;
  DELETE FROM public.sandbox_projects WHERE user_id = v_actor;
  DELETE FROM public.public_profiles WHERE id = v_actor;
  DELETE FROM public.profiles WHERE id = v_actor;
  DELETE FROM auth.users WHERE id = v_actor;

  RETURN TRUE;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.accept_privacy_terms(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_privacy_terms(TEXT) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.export_my_account_data() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.export_my_account_data() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.delete_my_account(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_my_account(TEXT) TO authenticated;

-- ==============================================================================
-- 5. Realtime para chat_message_reactions
-- ==============================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'chat_message_reactions'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_message_reactions;
    END IF;
  END IF;
END;
$$;

NOTIFY pgrst, 'reload schema';
