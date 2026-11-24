-- ==============================================================================
-- Codit (TCC-Codit) — Migração Sistema de Mensagens Embutido, Grupos (até 10),
-- Chamadas de Voz & Compartilhamento de Tela (sem vídeo de câmera)
-- ==============================================================================
-- Regras aplicadas no banco:
-- - RN-501: Apenas amigos aceitos (`public.friendships`) podem conversar em DMs
--           ou ser convidados para grupos.
-- - RN-502: Grupos suportam no máximo 10 membros ativos (`left_at IS NULL`).
-- - RN-503: Isolamento rigoroso por participante ativo (`auth.uid()`), zero `anon`.
-- ==============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ==============================================================================
-- 1. Tabelas: chat_conversations, chat_conversation_members, chat_messages
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.chat_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind VARCHAR(16) NOT NULL
    CONSTRAINT chk_chat_conversations_kind CHECK (kind IN ('direct', 'group')),
  title VARCHAR(80)
    CONSTRAINT chk_chat_conversations_title CHECK (
      (kind = 'direct' AND title IS NULL)
      OR (
        kind = 'group'
        AND title IS NOT NULL
        AND char_length(btrim(title)) BETWEEN 1 AND 80
      )
    ),
  created_by UUID NOT NULL
    CONSTRAINT fk_chat_conversations_created_by REFERENCES public.profiles(id) ON DELETE CASCADE,
  direct_pair_key TEXT
    CONSTRAINT chk_chat_conversations_direct_pair_key CHECK (
      (kind = 'direct' AND direct_pair_key IS NOT NULL AND char_length(direct_pair_key) = 73)
      OR (kind = 'group' AND direct_pair_key IS NULL)
    ),
  last_message_at TIMESTAMPTZ,
  last_message_preview VARCHAR(160),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_chat_conversations_direct_pair
  ON public.chat_conversations (direct_pair_key)
  WHERE direct_pair_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_chat_conversations_updated
  ON public.chat_conversations (COALESCE(last_message_at, updated_at) DESC);

CREATE INDEX IF NOT EXISTS idx_chat_conversations_created_by
  ON public.chat_conversations (created_by);

CREATE TABLE IF NOT EXISTS public.chat_conversation_members (
  conversation_id UUID NOT NULL
    CONSTRAINT fk_chat_members_conversation_id REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL
    CONSTRAINT fk_chat_members_user_id REFERENCES public.profiles(id) ON DELETE CASCADE,
  role VARCHAR(16) NOT NULL DEFAULT 'member'
    CONSTRAINT chk_chat_members_role CHECK (role IN ('owner', 'member')),
  added_by UUID
    CONSTRAINT fk_chat_members_added_by REFERENCES public.profiles(id) ON DELETE SET NULL,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  left_at TIMESTAMPTZ,
  last_read_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT pk_chat_conversation_members PRIMARY KEY (conversation_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_chat_members_user_active
  ON public.chat_conversation_members (user_id, updated_at DESC)
  WHERE left_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_chat_members_conv_active
  ON public.chat_conversation_members (conversation_id)
  WHERE left_at IS NULL;

CREATE TABLE IF NOT EXISTS public.chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL
    CONSTRAINT fk_chat_messages_conversation_id REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL
    CONSTRAINT fk_chat_messages_sender_id REFERENCES public.profiles(id) ON DELETE CASCADE,
  message_type VARCHAR(16) NOT NULL DEFAULT 'text'
    CONSTRAINT chk_chat_messages_type CHECK (message_type IN ('text', 'system')),
  content TEXT NOT NULL
    CONSTRAINT chk_chat_messages_content CHECK (char_length(btrim(content)) BETWEEN 1 AND 2000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation_created
  ON public.chat_messages (conversation_id, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_chat_messages_sender_id
  ON public.chat_messages (sender_id);

-- ==============================================================================
-- 2. Funções auxiliares de amizade, associação e envio (SECURITY DEFINER)
-- ==============================================================================
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
    AND EXISTS (
      SELECT 1
      FROM public.friendships f
      WHERE LEAST(f.requester_id, f.addressee_id) = LEAST(p_user_a, p_user_b)
        AND GREATEST(f.requester_id, f.addressee_id) = GREATEST(p_user_a, p_user_b)
        AND f.status = 'accepted'
    );
$$;

CREATE OR REPLACE FUNCTION public.is_active_chat_member(
  p_conversation_id UUID,
  p_user_id UUID DEFAULT auth.uid()
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p_conversation_id IS NOT NULL
    AND p_user_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.chat_conversation_members m
      WHERE m.conversation_id = p_conversation_id
        AND m.user_id = p_user_id
        AND m.left_at IS NULL
    );
$$;

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

-- ==============================================================================
-- 3. Triggers de integridade, concorrência (limite de 10 membros) e metadados
-- ==============================================================================
DROP TRIGGER IF EXISTS trg_chat_conversations_set_updated_at ON public.chat_conversations;
CREATE TRIGGER trg_chat_conversations_set_updated_at
  BEFORE UPDATE ON public.chat_conversations
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_chat_members_set_updated_at ON public.chat_conversation_members;
CREATE TRIGGER trg_chat_members_set_updated_at
  BEFORE UPDATE ON public.chat_conversation_members
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_chat_messages_set_updated_at ON public.chat_messages;
CREATE TRIGGER trg_chat_messages_set_updated_at
  BEFORE UPDATE ON public.chat_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.enforce_chat_member_limits()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_kind VARCHAR(16);
  v_other_active_count INTEGER;
  v_activating BOOLEAN;
BEGIN
  v_activating := (
    (TG_OP = 'INSERT' AND NEW.left_at IS NULL)
    OR (TG_OP = 'UPDATE' AND OLD.left_at IS NOT NULL AND NEW.left_at IS NULL)
  );

  IF NOT v_activating THEN
    RETURN NEW;
  END IF;

  SELECT c.kind
  INTO v_kind
  FROM public.chat_conversations c
  WHERE c.id = NEW.conversation_id
  FOR UPDATE;

  IF v_kind IS NULL THEN
    RAISE EXCEPTION 'Conversa não encontrada.'
      USING ERRCODE = '23503';
  END IF;

  SELECT COUNT(*)::INTEGER
  INTO v_other_active_count
  FROM public.chat_conversation_members m
  WHERE m.conversation_id = NEW.conversation_id
    AND m.user_id <> NEW.user_id
    AND m.left_at IS NULL;

  IF v_kind = 'direct' AND v_other_active_count >= 2 THEN
    RAISE EXCEPTION 'DIRECT_MEMBER_LIMIT_EXCEEDED'
      USING ERRCODE = 'P0001',
            DETAIL = 'Conversas diretas permitem exatamente 2 participantes.';
  END IF;

  IF v_kind = 'group' AND v_other_active_count >= 10 THEN
    RAISE EXCEPTION 'GROUP_MEMBER_LIMIT_EXCEEDED'
      USING ERRCODE = 'P0001',
            DETAIL = 'Grupos no Codit permitem no máximo 10 pessoas.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_chat_members_enforce_limits ON public.chat_conversation_members;
CREATE TRIGGER trg_chat_members_enforce_limits
  BEFORE INSERT OR UPDATE ON public.chat_conversation_members
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_chat_member_limits();

CREATE OR REPLACE FUNCTION public.guard_chat_member_direct_update()
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
    OR COALESCE(current_setting('codit.chat_rpc', true), '') = '1'
  );

  IF NOT v_is_privileged THEN
    IF NEW.role IS DISTINCT FROM OLD.role
       OR NEW.added_by IS DISTINCT FROM OLD.added_by
       OR NEW.joined_at IS DISTINCT FROM OLD.joined_at
       OR NEW.left_at IS DISTINCT FROM OLD.left_at THEN
      RAISE EXCEPTION 'Alteração direta de associação em conversa não permitida.'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_chat_members_guard_direct_update ON public.chat_conversation_members;
CREATE TRIGGER trg_chat_members_guard_direct_update
  BEFORE UPDATE ON public.chat_conversation_members
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_chat_member_direct_update();

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

  IF NEW.content IS DISTINCT FROM OLD.content THEN
    RAISE EXCEPTION 'Conteúdo da mensagem não pode ser alterado.'
      USING ERRCODE = 'P0001';
  END IF;

  IF OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL THEN
    RAISE EXCEPTION 'Não é permitido restaurar uma mensagem excluída.'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_chat_messages_guard_update ON public.chat_messages;
CREATE TRIGGER trg_chat_messages_guard_update
  BEFORE UPDATE ON public.chat_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_chat_message_update();

CREATE OR REPLACE FUNCTION public.on_chat_message_inserted()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM set_config('codit.chat_rpc', '1', true);

  UPDATE public.chat_conversations
  SET
    last_message_at = NEW.created_at,
    last_message_preview = left(btrim(NEW.content), 160),
    updated_at = NOW()
  WHERE id = NEW.conversation_id;

  IF NEW.message_type = 'text' THEN
    UPDATE public.chat_conversation_members
    SET last_read_at = GREATEST(last_read_at, NEW.created_at)
    WHERE conversation_id = NEW.conversation_id
      AND user_id = NEW.sender_id
      AND left_at IS NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_chat_messages_after_insert ON public.chat_messages;
CREATE TRIGGER trg_chat_messages_after_insert
  AFTER INSERT ON public.chat_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.on_chat_message_inserted();

CREATE OR REPLACE FUNCTION public.on_chat_message_soft_deleted()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_latest_created TIMESTAMPTZ;
  v_latest_preview VARCHAR(160);
BEGIN
  IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
    SELECT m.created_at, left(btrim(m.content), 160)
    INTO v_latest_created, v_latest_preview
    FROM public.chat_messages m
    WHERE m.conversation_id = NEW.conversation_id
      AND m.deleted_at IS NULL
    ORDER BY m.created_at DESC
    LIMIT 1;

    UPDATE public.chat_conversations
    SET
      last_message_at = v_latest_created,
      last_message_preview = v_latest_preview,
      updated_at = NOW()
    WHERE id = NEW.conversation_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_chat_messages_after_soft_delete ON public.chat_messages;
CREATE TRIGGER trg_chat_messages_after_soft_delete
  AFTER UPDATE OF deleted_at ON public.chat_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.on_chat_message_soft_deleted();

-- ==============================================================================
-- 4. RPCs atômicos (SECURITY DEFINER) com lock pessimista e checagem de amigos
-- ==============================================================================
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

CREATE OR REPLACE FUNCTION public.create_group_conversation(
  p_title TEXT,
  p_member_ids UUID[]
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_clean_title TEXT;
  v_invitees UUID[];
  v_invitee UUID;
  v_conversation_id UUID;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Autenticação obrigatória para criar grupo.'
      USING ERRCODE = '42501';
  END IF;

  v_clean_title := NULLIF(btrim(COALESCE(p_title, '')), '');
  IF v_clean_title IS NULL OR char_length(v_clean_title) > 80 THEN
    RAISE EXCEPTION 'Informe um nome de grupo entre 1 e 80 caracteres.'
      USING ERRCODE = '23514';
  END IF;

  SELECT COALESCE(array_agg(DISTINCT uid), ARRAY[]::UUID[])
  INTO v_invitees
  FROM unnest(COALESCE(p_member_ids, ARRAY[]::UUID[])) AS uid
  WHERE uid IS NOT NULL
    AND uid <> v_actor;

  IF COALESCE(cardinality(v_invitees), 0) < 1 THEN
    RAISE EXCEPTION 'GROUP_MIN_MEMBERS_REQUIRED'
      USING ERRCODE = 'P0001',
            DETAIL = 'Convide pelo menos 1 amigo para criar um grupo.';
  END IF;

  IF cardinality(v_invitees) > 9 THEN
    RAISE EXCEPTION 'GROUP_MEMBER_LIMIT_EXCEEDED'
      USING ERRCODE = 'P0001',
            DETAIL = 'Grupos no Codit permitem no máximo 10 pessoas (você + até 9 amigos).';
  END IF;

  FOREACH v_invitee IN ARRAY v_invitees
  LOOP
    IF NOT public.are_users_friends(v_actor, v_invitee) THEN
      RAISE EXCEPTION 'CHAT_NOT_FRIENDS'
        USING ERRCODE = 'P0001',
              DETAIL = 'Apenas amigos aceitos podem ser convidados para o grupo.';
    END IF;
  END LOOP;

  PERFORM set_config('codit.chat_rpc', '1', true);

  INSERT INTO public.chat_conversations (kind, title, created_by, direct_pair_key)
  VALUES ('group', v_clean_title, v_actor, NULL)
  RETURNING id INTO v_conversation_id;

  INSERT INTO public.chat_conversation_members (conversation_id, user_id, role, added_by)
  VALUES (v_conversation_id, v_actor, 'owner', v_actor);

  INSERT INTO public.chat_conversation_members (conversation_id, user_id, role, added_by)
  SELECT v_conversation_id, uid, 'member', v_actor
  FROM unnest(v_invitees) AS uid;

  INSERT INTO public.chat_messages (conversation_id, sender_id, message_type, content)
  VALUES (
    v_conversation_id,
    v_actor,
    'system',
    format('Grupo "%s" criado com %s participantes.', v_clean_title, cardinality(v_invitees) + 1)
  );

  RETURN v_conversation_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.add_group_conversation_members(
  p_conversation_id UUID,
  p_member_ids UUID[]
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_kind VARCHAR(16);
  v_active_count INTEGER;
  v_new_ids UUID[];
  v_uid UUID;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Autenticação obrigatória para adicionar membros.'
      USING ERRCODE = '42501';
  END IF;

  IF NOT public.is_active_chat_member(p_conversation_id, v_actor) THEN
    RAISE EXCEPTION 'Você não participa deste grupo.'
      USING ERRCODE = '42501';
  END IF;

  SELECT c.kind
  INTO v_kind
  FROM public.chat_conversations c
  WHERE c.id = p_conversation_id
  FOR UPDATE;

  IF v_kind IS NULL OR v_kind <> 'group' THEN
    RAISE EXCEPTION 'Somente grupos permitem adicionar novos participantes.'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT COALESCE(array_agg(DISTINCT uid), ARRAY[]::UUID[])
  INTO v_new_ids
  FROM unnest(COALESCE(p_member_ids, ARRAY[]::UUID[])) AS uid
  WHERE uid IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.chat_conversation_members m
      WHERE m.conversation_id = p_conversation_id
        AND m.user_id = uid
        AND m.left_at IS NULL
    );

  IF COALESCE(cardinality(v_new_ids), 0) = 0 THEN
    RETURN 0;
  END IF;

  SELECT COUNT(*)::INTEGER
  INTO v_active_count
  FROM public.chat_conversation_members m
  WHERE m.conversation_id = p_conversation_id
    AND m.left_at IS NULL;

  IF (v_active_count + cardinality(v_new_ids)) > 10 THEN
    RAISE EXCEPTION 'GROUP_MEMBER_LIMIT_EXCEEDED'
      USING ERRCODE = 'P0001',
            DETAIL = 'Grupos no Codit permitem no máximo 10 pessoas.';
  END IF;

  FOREACH v_uid IN ARRAY v_new_ids
  LOOP
    IF NOT public.are_users_friends(v_actor, v_uid) THEN
      RAISE EXCEPTION 'CHAT_NOT_FRIENDS'
        USING ERRCODE = 'P0001',
              DETAIL = 'Você só pode adicionar amigos aceitos ao grupo.';
    END IF;
  END LOOP;

  PERFORM set_config('codit.chat_rpc', '1', true);

  INSERT INTO public.chat_conversation_members (
    conversation_id,
    user_id,
    role,
    added_by,
    joined_at,
    left_at,
    last_read_at
  )
  SELECT
    p_conversation_id,
    uid,
    'member',
    v_actor,
    NOW(),
    NULL,
    NOW()
  FROM unnest(v_new_ids) AS uid
  ON CONFLICT (conversation_id, user_id)
  DO UPDATE SET
    role = 'member',
    added_by = v_actor,
    joined_at = NOW(),
    left_at = NULL,
    last_read_at = NOW(),
    updated_at = NOW();

  INSERT INTO public.chat_messages (conversation_id, sender_id, message_type, content)
  VALUES (
    p_conversation_id,
    v_actor,
    'system',
    CASE
      WHEN cardinality(v_new_ids) = 1 THEN '1 novo amigo foi adicionado ao grupo.'
      ELSE format('%s novos amigos foram adicionados ao grupo.', cardinality(v_new_ids))
    END
  );

  RETURN cardinality(v_new_ids);
END;
$$;

CREATE OR REPLACE FUNCTION public.remove_or_leave_group_member(
  p_conversation_id UUID,
  p_target_user_id UUID DEFAULT auth.uid()
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_target UUID := COALESCE(p_target_user_id, auth.uid());
  v_kind VARCHAR(16);
  v_actor_role VARCHAR(16);
  v_target_exists BOOLEAN;
  v_target_username TEXT;
  v_next_owner UUID;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Autenticação obrigatória.'
      USING ERRCODE = '42501';
  END IF;

  SELECT c.kind
  INTO v_kind
  FROM public.chat_conversations c
  WHERE c.id = p_conversation_id
  FOR UPDATE;

  IF v_kind IS NULL OR v_kind <> 'group' THEN
    RAISE EXCEPTION 'Esta ação só é válida para grupos.'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT m.role
  INTO v_actor_role
  FROM public.chat_conversation_members m
  WHERE m.conversation_id = p_conversation_id
    AND m.user_id = v_actor
    AND m.left_at IS NULL;

  IF v_actor_role IS NULL THEN
    RAISE EXCEPTION 'Você não é membro ativo deste grupo.'
      USING ERRCODE = '42501';
  END IF;

  IF v_target <> v_actor AND v_actor_role <> 'owner' THEN
    RAISE EXCEPTION 'Apenas o criador/administrador do grupo pode remover outros membros.'
      USING ERRCODE = '42501';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.chat_conversation_members m
    WHERE m.conversation_id = p_conversation_id
      AND m.user_id = v_target
      AND m.left_at IS NULL
  )
  INTO v_target_exists;

  IF NOT v_target_exists THEN
    RETURN FALSE;
  END IF;

  PERFORM set_config('codit.chat_rpc', '1', true);

  UPDATE public.chat_conversation_members
  SET
    left_at = NOW(),
    role = 'member',
    updated_at = NOW()
  WHERE conversation_id = p_conversation_id
    AND user_id = v_target
    AND left_at IS NULL;

  IF NOT EXISTS (
    SELECT 1
    FROM public.chat_conversation_members m
    WHERE m.conversation_id = p_conversation_id
      AND m.left_at IS NULL
      AND m.role = 'owner'
  ) THEN
    SELECT m.user_id
    INTO v_next_owner
    FROM public.chat_conversation_members m
    WHERE m.conversation_id = p_conversation_id
      AND m.left_at IS NULL
    ORDER BY m.joined_at ASC, m.user_id ASC
    LIMIT 1;

    IF v_next_owner IS NOT NULL THEN
      UPDATE public.chat_conversation_members
      SET role = 'owner', updated_at = NOW()
      WHERE conversation_id = p_conversation_id
        AND user_id = v_next_owner;
    END IF;
  END IF;

  SELECT p.username
  INTO v_target_username
  FROM public.public_profiles p
  WHERE p.id = v_target;

  IF EXISTS (
    SELECT 1
    FROM public.chat_conversation_members m
    WHERE m.conversation_id = p_conversation_id
      AND m.left_at IS NULL
  ) THEN
    INSERT INTO public.chat_messages (conversation_id, sender_id, message_type, content)
    VALUES (
      p_conversation_id,
      v_actor,
      'system',
      CASE
        WHEN v_target = v_actor THEN format('@%s saiu do grupo.', COALESCE(v_target_username, 'participante'))
        ELSE format('@%s foi removido do grupo.', COALESCE(v_target_username, 'participante'))
      END
    );
  END IF;

  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.rename_group_conversation(
  p_conversation_id UUID,
  p_title TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_clean_title TEXT;
  v_kind VARCHAR(16);
  v_actor_role VARCHAR(16);
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Autenticação obrigatória.'
      USING ERRCODE = '42501';
  END IF;

  v_clean_title := NULLIF(btrim(COALESCE(p_title, '')), '');
  IF v_clean_title IS NULL OR char_length(v_clean_title) > 80 THEN
    RAISE EXCEPTION 'Informe um nome de grupo entre 1 e 80 caracteres.'
      USING ERRCODE = '23514';
  END IF;

  SELECT c.kind
  INTO v_kind
  FROM public.chat_conversations c
  WHERE c.id = p_conversation_id
  FOR UPDATE;

  IF v_kind IS NULL OR v_kind <> 'group' THEN
    RAISE EXCEPTION 'Somente grupos podem ser renomeados.'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT m.role
  INTO v_actor_role
  FROM public.chat_conversation_members m
  WHERE m.conversation_id = p_conversation_id
    AND m.user_id = v_actor
    AND m.left_at IS NULL;

  IF v_actor_role <> 'owner' THEN
    RAISE EXCEPTION 'Apenas o administrador do grupo pode alterar o nome.'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.chat_conversations
  SET title = v_clean_title, updated_at = NOW()
  WHERE id = p_conversation_id;

  INSERT INTO public.chat_messages (conversation_id, sender_id, message_type, content)
  VALUES (
    p_conversation_id,
    v_actor,
    'system',
    format('Nome do grupo alterado para "%s".', v_clean_title)
  );

  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_conversation_read(
  p_conversation_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
BEGIN
  IF v_actor IS NULL OR p_conversation_id IS NULL THEN
    RETURN FALSE;
  END IF;

  PERFORM set_config('codit.chat_rpc', '1', true);

  UPDATE public.chat_conversation_members
  SET last_read_at = NOW()
  WHERE conversation_id = p_conversation_id
    AND user_id = v_actor
    AND left_at IS NULL;

  RETURN FOUND;
END;
$$;

-- ==============================================================================
-- 5. Row-Level Security (RLS) & Privilégios Mínimos (zero anon)
-- ==============================================================================
ALTER TABLE public.chat_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_conversation_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS chat_conversations_select_member ON public.chat_conversations;
CREATE POLICY chat_conversations_select_member
  ON public.chat_conversations
  FOR SELECT
  TO authenticated
  USING (public.is_active_chat_member(id));

DROP POLICY IF EXISTS chat_members_select_member ON public.chat_conversation_members;
CREATE POLICY chat_members_select_member
  ON public.chat_conversation_members
  FOR SELECT
  TO authenticated
  USING (public.is_active_chat_member(conversation_id));

DROP POLICY IF EXISTS chat_members_update_own_read ON public.chat_conversation_members;
CREATE POLICY chat_members_update_own_read
  ON public.chat_conversation_members
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id AND left_at IS NULL)
  WITH CHECK (auth.uid() = user_id AND left_at IS NULL);

DROP POLICY IF EXISTS chat_messages_select_member ON public.chat_messages;
CREATE POLICY chat_messages_select_member
  ON public.chat_messages
  FOR SELECT
  TO authenticated
  USING (public.is_active_chat_member(conversation_id));

DROP POLICY IF EXISTS chat_messages_insert_member ON public.chat_messages;
CREATE POLICY chat_messages_insert_member
  ON public.chat_messages
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = sender_id
    AND message_type = 'text'
    AND public.can_send_chat_message(conversation_id)
  );

DROP POLICY IF EXISTS chat_messages_update_soft_delete ON public.chat_messages;
CREATE POLICY chat_messages_update_soft_delete
  ON public.chat_messages
  FOR UPDATE
  TO authenticated
  USING (
    auth.uid() = sender_id
    AND public.is_active_chat_member(conversation_id)
  )
  WITH CHECK (
    auth.uid() = sender_id
    AND public.is_active_chat_member(conversation_id)
  );

REVOKE ALL ON TABLE public.chat_conversations FROM anon, authenticated;
GRANT SELECT ON TABLE public.chat_conversations TO authenticated;

REVOKE ALL ON TABLE public.chat_conversation_members FROM anon, authenticated;
GRANT SELECT, UPDATE ON TABLE public.chat_conversation_members TO authenticated;

REVOKE ALL ON TABLE public.chat_messages FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.chat_messages TO authenticated;

REVOKE EXECUTE ON FUNCTION public.are_users_friends(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.are_users_friends(UUID, UUID) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.is_active_chat_member(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_active_chat_member(UUID, UUID) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.can_send_chat_message(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_send_chat_message(UUID) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.get_or_create_direct_conversation(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_or_create_direct_conversation(UUID) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.create_group_conversation(TEXT, UUID[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_group_conversation(TEXT, UUID[]) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.add_group_conversation_members(UUID, UUID[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_group_conversation_members(UUID, UUID[]) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.remove_or_leave_group_member(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.remove_or_leave_group_member(UUID, UUID) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.rename_group_conversation(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rename_group_conversation(UUID, TEXT) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.mark_conversation_read(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_conversation_read(UUID) TO authenticated;

-- ==============================================================================
-- 6. Publicação Supabase Realtime (postgres_changes respeitando RLS)
-- ==============================================================================
DO $$
DECLARE
  v_tbl TEXT;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    FOREACH v_tbl IN ARRAY ARRAY[
      'chat_conversations',
      'chat_conversation_members',
      'chat_messages'
    ]
    LOOP
      IF NOT EXISTS (
        SELECT 1
        FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
          AND schemaname = 'public'
          AND tablename = v_tbl
      ) THEN
        EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', v_tbl);
      END IF;
    END LOOP;
  END IF;
END;
$$;

NOTIFY pgrst, 'reload schema';
