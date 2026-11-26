-- ==============================================================================
-- Codit (TCC-Codit) — Hardening de Segurança: Realtime RLS, chat_conversation_members,
-- Funções SECURITY DEFINER (grafo social) e GUCs locais em triggers
-- ==============================================================================
-- Corrige 4 falhas:
--   1. [CRÍTICA] Políticas RLS em realtime.messages para canais privados
--      (codit:user-inbox:<uid>, codit:notifications:<uid>, codit:call:<convId>,
--      codit:conv:<convId>) + fan-out server-side via realtime.send(..., true).
--   2. [ALTA] Revogação de UPDATE direto em public.chat_conversation_members +
--      imutabilidade incondicional de (conversation_id, user_id) no trigger.
--   3. [MENOR] Restrição de auth.uid() em are_users_friends e is_active_chat_member.
--   4. [MENOR] Blindagem de codit.chat_rpc e codit.internal_notify_write exigindo
--      current_user privilegiado, pg_trigger_depth() e reset local imediato.
-- ==============================================================================

-- ==============================================================================
-- 1. Helper seguro de parse de UUID para políticas RLS de realtime.topic()
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.try_parse_uuid(p_raw TEXT)
RETURNS UUID
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_raw IS NOT NULL
      AND p_raw ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    THEN p_raw::UUID
    ELSE NULL::UUID
  END;
$$;

REVOKE ALL ON FUNCTION public.try_parse_uuid(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.try_parse_uuid(TEXT) TO authenticated;

-- ==============================================================================
-- 2. [MENOR] Evitar vazamento de grafo social via funções SECURITY DEFINER
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
    AND (
      COALESCE(auth.role(), '') = 'service_role'
      OR (
        COALESCE(auth.role(), '') = ''
        AND session_user IN ('postgres', 'supabase_admin')
      )
      OR (
        auth.uid() IS NOT NULL
        AND (p_user_a = auth.uid() OR p_user_b = auth.uid())
      )
    )
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
    AND (
      COALESCE(auth.role(), '') = 'service_role'
      OR (
        COALESCE(auth.role(), '') = ''
        AND session_user IN ('postgres', 'supabase_admin')
      )
      OR (
        auth.uid() IS NOT NULL
        AND p_user_id = auth.uid()
      )
    )
    AND EXISTS (
      SELECT 1
      FROM public.chat_conversation_members m
      WHERE m.conversation_id = p_conversation_id
        AND m.user_id = p_user_id
        AND m.left_at IS NULL
    );
$$;

REVOKE ALL ON FUNCTION public.are_users_friends(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.are_users_friends(UUID, UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.is_active_chat_member(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_active_chat_member(UUID, UUID) TO authenticated;

-- ==============================================================================
-- 3. [ALTA + MENOR] Revogar UPDATE direto em chat_conversation_members e blindar
--    triggers guard_chat_member_direct_update e guard_notification_update
-- ==============================================================================
DROP POLICY IF EXISTS chat_members_update_own_read ON public.chat_conversation_members;

REVOKE UPDATE ON TABLE public.chat_conversation_members FROM anon, authenticated;
GRANT SELECT ON TABLE public.chat_conversation_members TO authenticated;

CREATE OR REPLACE FUNCTION public.guard_chat_member_direct_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_is_privileged BOOLEAN;
BEGIN
  -- Chaves primárias de associação nunca podem ser reatribuídas entre conversas ou usuários.
  IF NEW.conversation_id IS DISTINCT FROM OLD.conversation_id
     OR NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'Identificadores primários de associação em conversa são imutáveis.'
      USING ERRCODE = '42501';
  END IF;

  v_is_privileged := (
    COALESCE(auth.role(), '') = 'service_role'
    OR (
      COALESCE(auth.role(), '') = ''
      AND session_user IN ('postgres', 'supabase_admin')
    )
    OR (
      current_user IN ('postgres', 'supabase_admin')
      AND COALESCE(current_setting('codit.chat_rpc', true), '') = '1'
    )
  );

  IF NOT v_is_privileged THEN
    IF NEW.role IS DISTINCT FROM OLD.role
       OR NEW.added_by IS DISTINCT FROM OLD.added_by
       OR NEW.joined_at IS DISTINCT FROM OLD.joined_at
       OR NEW.left_at IS DISTINCT FROM OLD.left_at
       OR NEW.last_read_at IS DISTINCT FROM OLD.last_read_at THEN
      RAISE EXCEPTION 'Alteração direta de associação em conversa não permitida.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_notification_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_is_privileged BOOLEAN;
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.recipient_id IS DISTINCT FROM OLD.recipient_id THEN
    RAISE EXCEPTION 'Identidade da notificação é imutável.'
      USING ERRCODE = '42501';
  END IF;

  v_is_privileged := (
    COALESCE(auth.role(), '') = 'service_role'
    OR (
      COALESCE(auth.role(), '') = ''
      AND session_user IN ('postgres', 'supabase_admin')
    )
    OR (
      current_user IN ('postgres', 'supabase_admin')
      AND pg_trigger_depth() >= 2
      AND COALESCE(current_setting('codit.internal_notify_write', true), '') = 'on'
    )
  );

  IF v_is_privileged THEN
    RETURN NEW;
  END IF;

  IF NEW.actor_id IS DISTINCT FROM OLD.actor_id
     OR NEW.category IS DISTINCT FROM OLD.category
     OR NEW.title IS DISTINCT FROM OLD.title
     OR NEW.body IS DISTINCT FROM OLD.body
     OR NEW.link_href IS DISTINCT FROM OLD.link_href
     OR NEW.entity_key IS DISTINCT FROM OLD.entity_key
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Apenas o estado de leitura da notificação pode ser atualizado.'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

-- ==============================================================================
-- 4. Reset imediato de codit.chat_rpc nas funções SECURITY DEFINER autorizadas +
--    fan-out privado de message:notify em on_chat_message_inserted
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.on_chat_message_inserted()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_conv_kind VARCHAR(16);
  v_conv_title TEXT;
  v_sender_name TEXT;
  v_sender_username TEXT;
  v_sender_avatar TEXT;
  v_recipient_id UUID;
  v_payload JSONB;
BEGIN
  UPDATE public.chat_conversations
  SET
    last_message_at = NEW.created_at,
    last_message_preview = left(btrim(NEW.content), 160),
    updated_at = NOW()
  WHERE id = NEW.conversation_id;

  IF NEW.message_type = 'text' THEN
    BEGIN
      PERFORM set_config('codit.chat_rpc', '1', true);

      UPDATE public.chat_conversation_members
      SET last_read_at = GREATEST(last_read_at, NEW.created_at)
      WHERE conversation_id = NEW.conversation_id
        AND user_id = NEW.sender_id
        AND left_at IS NULL;

      PERFORM set_config('codit.chat_rpc', '', true);
    EXCEPTION WHEN OTHERS THEN
      PERFORM set_config('codit.chat_rpc', '', true);
      RAISE;
    END;

    IF NEW.deleted_at IS NULL
       AND to_regprocedure('realtime.send(jsonb,text,text,boolean)') IS NOT NULL THEN
      BEGIN
        SELECT c.kind, c.title
        INTO v_conv_kind, v_conv_title
        FROM public.chat_conversations c
        WHERE c.id = NEW.conversation_id;

        SELECT
          COALESCE(NULLIF(btrim(p.full_name), ''), '@' || p.username, 'Estudante Codit'),
          COALESCE(p.username, 'codit'),
          p.avatar_url
        INTO v_sender_name, v_sender_username, v_sender_avatar
        FROM public.public_profiles p
        WHERE p.id = NEW.sender_id;

        v_payload := jsonb_build_object(
          'conversationId', NEW.conversation_id,
          'conversationTitle', CASE
            WHEN v_conv_kind = 'group' THEN COALESCE(NULLIF(btrim(v_conv_title), ''), 'Grupo Codit')
            ELSE COALESCE(v_sender_name, 'Estudante Codit')
          END,
          'isGroup', COALESCE(v_conv_kind = 'group', FALSE),
          'senderId', NEW.sender_id,
          'senderName', COALESCE(v_sender_name, 'Estudante Codit'),
          'senderUsername', COALESCE(v_sender_username, 'codit'),
          'senderAvatarUrl', v_sender_avatar,
          'preview', left(btrim(NEW.content), 140),
          'sentAt', NEW.created_at
        );

        FOR v_recipient_id IN
          SELECT m.user_id
          FROM public.chat_conversation_members m
          WHERE m.conversation_id = NEW.conversation_id
            AND m.left_at IS NULL
            AND m.user_id <> NEW.sender_id
        LOOP
          PERFORM realtime.send(
            v_payload,
            'message:notify',
            'codit:user-inbox:' || v_recipient_id::TEXT,
            TRUE
          );
        END LOOP;
      EXCEPTION WHEN OTHERS THEN
        -- Falha transitória no broadcast Realtime não deve impedir persistência da mensagem.
        NULL;
      END;
    END IF;
  END IF;

  RETURN NEW;
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

  IF NOT public.are_users_friends(v_actor, p_friend_id) THEN
    RAISE EXCEPTION 'CHAT_NOT_FRIENDS'
      USING ERRCODE = 'P0001',
            DETAIL = 'Apenas amigos aceitos podem enviar mensagens diretas no Codit.';
  END IF;

  v_pair_key := LEAST(v_actor, p_friend_id)::TEXT || ':' || GREATEST(v_actor, p_friend_id)::TEXT;

  INSERT INTO public.chat_conversations (kind, title, created_by, direct_pair_key)
  VALUES ('direct', NULL, v_actor, v_pair_key)
  ON CONFLICT (direct_pair_key) WHERE direct_pair_key IS NOT NULL
  DO UPDATE SET updated_at = NOW()
  RETURNING id INTO v_conversation_id;

  BEGIN
    PERFORM set_config('codit.chat_rpc', '1', true);

    INSERT INTO public.chat_conversation_members (conversation_id, user_id, role, added_by, left_at)
    VALUES
      (v_conversation_id, v_actor, 'member', v_actor, NULL),
      (v_conversation_id, p_friend_id, 'member', v_actor, NULL)
    ON CONFLICT (conversation_id, user_id)
    DO UPDATE SET
      left_at = NULL,
      updated_at = NOW();

    PERFORM set_config('codit.chat_rpc', '', true);
  EXCEPTION WHEN OTHERS THEN
    PERFORM set_config('codit.chat_rpc', '', true);
    RAISE;
  END;

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

  INSERT INTO public.chat_conversations (kind, title, created_by, direct_pair_key)
  VALUES ('group', v_clean_title, v_actor, NULL)
  RETURNING id INTO v_conversation_id;

  BEGIN
    PERFORM set_config('codit.chat_rpc', '1', true);

    INSERT INTO public.chat_conversation_members (conversation_id, user_id, role, added_by)
    VALUES (v_conversation_id, v_actor, 'owner', v_actor);

    INSERT INTO public.chat_conversation_members (conversation_id, user_id, role, added_by)
    SELECT v_conversation_id, uid, 'member', v_actor
    FROM unnest(v_invitees) AS uid;

    PERFORM set_config('codit.chat_rpc', '', true);
  EXCEPTION WHEN OTHERS THEN
    PERFORM set_config('codit.chat_rpc', '', true);
    RAISE;
  END;

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

  BEGIN
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

    PERFORM set_config('codit.chat_rpc', '', true);
  EXCEPTION WHEN OTHERS THEN
    PERFORM set_config('codit.chat_rpc', '', true);
    RAISE;
  END;

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

  BEGIN
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

    PERFORM set_config('codit.chat_rpc', '', true);
  EXCEPTION WHEN OTHERS THEN
    PERFORM set_config('codit.chat_rpc', '', true);
    RAISE;
  END;

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
  v_updated BOOLEAN := FALSE;
BEGIN
  IF v_actor IS NULL OR p_conversation_id IS NULL THEN
    RETURN FALSE;
  END IF;

  BEGIN
    PERFORM set_config('codit.chat_rpc', '1', true);

    UPDATE public.chat_conversation_members
    SET last_read_at = NOW()
    WHERE conversation_id = p_conversation_id
      AND user_id = v_actor
      AND left_at IS NULL;

    v_updated := FOUND;
    PERFORM set_config('codit.chat_rpc', '', true);
  EXCEPTION WHEN OTHERS THEN
    PERFORM set_config('codit.chat_rpc', '', true);
    RAISE;
  END;

  RETURN v_updated;
END;
$$;

-- ==============================================================================
-- 5. RPC SECURITY DEFINER para notificar chamada recebida (call:incoming privado)
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.notify_incoming_call(
  p_conversation_id UUID,
  p_call_id UUID DEFAULT NULL,
  p_has_video BOOLEAN DEFAULT FALSE
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_call_id UUID := COALESCE(p_call_id, gen_random_uuid());
  v_conv_kind VARCHAR(16);
  v_conv_title TEXT;
  v_caller_name TEXT;
  v_caller_username TEXT;
  v_caller_avatar TEXT;
  v_recipient_id UUID;
  v_notice JSONB;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Autenticação obrigatória para iniciar chamadas.'
      USING ERRCODE = '42501';
  END IF;

  IF p_conversation_id IS NULL OR NOT public.can_send_chat_message(p_conversation_id) THEN
    RAISE EXCEPTION 'Você não tem permissão para chamar nesta conversa.'
      USING ERRCODE = '42501';
  END IF;

  SELECT c.kind, c.title
  INTO v_conv_kind, v_conv_title
  FROM public.chat_conversations c
  WHERE c.id = p_conversation_id;

  IF v_conv_kind IS NULL THEN
    RAISE EXCEPTION 'Conversa não encontrada.'
      USING ERRCODE = 'P0002';
  END IF;

  SELECT
    COALESCE(NULLIF(btrim(p.full_name), ''), '@' || p.username, 'Estudante Codit'),
    COALESCE(p.username, 'codit'),
    p.avatar_url
  INTO v_caller_name, v_caller_username, v_caller_avatar
  FROM public.public_profiles p
  WHERE p.id = v_caller;

  v_notice := jsonb_build_object(
    'callId', v_call_id,
    'conversationId', p_conversation_id,
    'conversationTitle', CASE
      WHEN v_conv_kind = 'group' THEN COALESCE(NULLIF(btrim(v_conv_title), ''), 'Grupo Codit')
      ELSE COALESCE(v_caller_name, 'Estudante Codit')
    END,
    'isGroup', v_conv_kind = 'group',
    'callerId', v_caller,
    'callerName', COALESCE(v_caller_name, 'Estudante Codit'),
    'callerUsername', COALESCE(v_caller_username, 'codit'),
    'callerAvatarUrl', v_caller_avatar,
    'hasVideo', COALESCE(p_has_video, FALSE),
    'timeoutSeconds', 60,
    'sentAt', NOW()
  );

  IF to_regprocedure('realtime.send(jsonb,text,text,boolean)') IS NOT NULL THEN
    FOR v_recipient_id IN
      SELECT m.user_id
      FROM public.chat_conversation_members m
      WHERE m.conversation_id = p_conversation_id
        AND m.left_at IS NULL
        AND m.user_id <> v_caller
    LOOP
      BEGIN
        PERFORM realtime.send(
          v_notice,
          'call:incoming',
          'codit:user-inbox:' || v_recipient_id::TEXT,
          TRUE
        );
      EXCEPTION WHEN OTHERS THEN
        NULL;
      END;
    END LOOP;
  END IF;

  RETURN v_call_id;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_incoming_call(UUID, UUID, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.notify_incoming_call(UUID, UUID, BOOLEAN) TO authenticated;

-- ==============================================================================
-- 6. [CRÍTICA] Políticas RLS em realtime.messages para canais privados
-- ==============================================================================
-- Nota: `realtime.messages` pertence a `supabase_realtime_admin` e já possui RLS
-- habilitada por padrão no Supabase; `ALTER TABLE` falha com 42501 para `postgres`.
DO $$
BEGIN
  IF to_regclass('realtime.messages') IS NOT NULL THEN
    DROP POLICY IF EXISTS codit_realtime_messages_select_authenticated ON realtime.messages;
    CREATE POLICY codit_realtime_messages_select_authenticated
      ON realtime.messages
      FOR SELECT
      TO authenticated
      USING (
        extension IN ('broadcast', 'presence')
        AND split_part(realtime.topic(), ':', 4) = ''
        AND (
          (
            split_part(realtime.topic(), ':', 1) = 'codit'
            AND split_part(realtime.topic(), ':', 2) IN ('user-inbox', 'notifications')
            AND split_part(realtime.topic(), ':', 3) = auth.uid()::TEXT
          )
          OR (
            split_part(realtime.topic(), ':', 1) = 'codit'
            AND split_part(realtime.topic(), ':', 2) IN ('call', 'conv')
            AND public.is_active_chat_member(
              public.try_parse_uuid(split_part(realtime.topic(), ':', 3)),
              auth.uid()
            )
          )
        )
      );

    DROP POLICY IF EXISTS codit_realtime_messages_insert_authenticated ON realtime.messages;
    CREATE POLICY codit_realtime_messages_insert_authenticated
      ON realtime.messages
      FOR INSERT
      TO authenticated
      WITH CHECK (
        extension IN ('broadcast', 'presence')
        AND split_part(realtime.topic(), ':', 4) = ''
        AND split_part(realtime.topic(), ':', 1) = 'codit'
        AND split_part(realtime.topic(), ':', 2) IN ('call', 'conv')
        AND public.is_active_chat_member(
          public.try_parse_uuid(split_part(realtime.topic(), ':', 3)),
          auth.uid()
        )
      );
  END IF;
END
$$;

NOTIFY pgrst, 'reload schema';
