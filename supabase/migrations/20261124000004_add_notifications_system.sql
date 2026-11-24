-- ==============================================================================
-- Codit (TCC-Codit) — Sistema de Notificações & Preferências Granulares de Mudo
-- ==============================================================================
-- Arquitetura de baixo consumo de armazenamento no banco:
--   - Preferências armazenadas em coluna JSONB compacta (~160 bytes) em
--     `public.profiles.notification_prefs` (nunca exposta em `public_profiles`).
--   - Notificações silenciadas pelo usuário nem chegam a ser inseridas em
--     `public.notifications` (0 bytes gravados para categorias mutadas).
--   - Poda automática por `recipient_id` mantendo no máximo as 60 notificações
--     mais recentes por usuário e deduplicação por `entity_key`.
--   - Mensagens de chat e chamadas WebRTC em tempo real continuam usando os
--     canais efêmeros / `chat_messages` existentes sem duplicação no banco.
-- ==============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ==============================================================================
-- 1. Preferências de notificação em `public.profiles` (privadas)
-- ==============================================================================
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS notification_prefs JSONB NOT NULL DEFAULT
    '{"mute_all":false,"toast_enabled":true,"sound_enabled":true,"browser_push_enabled":false,"categories":{"messages":true,"voice_calls":true,"project_likes":true,"project_comments":true,"friend_requests":true,"friend_accepted":true,"group_invites":true},"muted_conversation_ids":[]}'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_profiles_notification_prefs_object'
      AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT chk_profiles_notification_prefs_object
      CHECK (jsonb_typeof(notification_prefs) = 'object');
  END IF;
END
$$;

-- ==============================================================================
-- 2. Tabela `public.notifications` (RLS estrita + poda automática)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id UUID NOT NULL
    CONSTRAINT fk_notifications_recipient_id REFERENCES public.profiles(id) ON DELETE CASCADE,
  actor_id UUID
    CONSTRAINT fk_notifications_actor_id REFERENCES public.profiles(id) ON DELETE SET NULL,
  category VARCHAR(24) NOT NULL
    CONSTRAINT chk_notifications_category CHECK (
      category IN (
        'message',
        'voice_call',
        'project_like',
        'project_comment',
        'friend_request',
        'friend_accepted',
        'group_invite'
      )
    ),
  title VARCHAR(140) NOT NULL
    CONSTRAINT chk_notifications_title CHECK (char_length(btrim(title)) BETWEEN 1 AND 140),
  body VARCHAR(240)
    CONSTRAINT chk_notifications_body CHECK (body IS NULL OR char_length(body) <= 240),
  link_href VARCHAR(200)
    CONSTRAINT chk_notifications_link_href CHECK (
      link_href IS NULL
      OR (char_length(link_href) <= 200 AND left(link_href, 1) = '/')
    ),
  entity_key VARCHAR(120)
    CONSTRAINT chk_notifications_entity_key CHECK (entity_key IS NULL OR char_length(entity_key) <= 120),
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_notifications_no_self CHECK (actor_id IS NULL OR actor_id <> recipient_id)
);

CREATE INDEX IF NOT EXISTS idx_notifications_recipient_created
  ON public.notifications (recipient_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_recipient_unread
  ON public.notifications (recipient_id, created_at DESC)
  WHERE read_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_notifications_actor_id
  ON public.notifications (actor_id)
  WHERE actor_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_notifications_recipient_entity_key
  ON public.notifications (recipient_id, entity_key)
  WHERE entity_key IS NOT NULL;

-- ==============================================================================
-- 3. Privilégios, RLS e proteção de colunas imutáveis
-- ==============================================================================
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.notifications FROM PUBLIC, anon;
GRANT SELECT, UPDATE, DELETE ON public.notifications TO authenticated;

DROP POLICY IF EXISTS notifications_select_own ON public.notifications;
CREATE POLICY notifications_select_own
  ON public.notifications
  FOR SELECT
  TO authenticated
  USING (auth.uid() = recipient_id);

DROP POLICY IF EXISTS notifications_update_own ON public.notifications;
CREATE POLICY notifications_update_own
  ON public.notifications
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = recipient_id)
  WITH CHECK (auth.uid() = recipient_id);

DROP POLICY IF EXISTS notifications_delete_own ON public.notifications;
CREATE POLICY notifications_delete_own
  ON public.notifications
  FOR DELETE
  TO authenticated
  USING (auth.uid() = recipient_id);

CREATE OR REPLACE FUNCTION public.guard_notification_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF auth.role() = 'service_role'
     OR current_setting('codit.internal_notify_write', true) = 'on' THEN
    RETURN NEW;
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.recipient_id IS DISTINCT FROM OLD.recipient_id
     OR NEW.actor_id IS DISTINCT FROM OLD.actor_id
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

DROP TRIGGER IF EXISTS trg_notifications_guard_update ON public.notifications;
CREATE TRIGGER trg_notifications_guard_update
  BEFORE UPDATE ON public.notifications
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_notification_update();

-- ==============================================================================
-- 4. Helpers SECURITY DEFINER para respeitar mudo e limitar retenção em 60/usuário
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.is_notification_category_enabled(
  p_recipient_id UUID,
  p_pref_key TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prefs JSONB;
  v_categories JSONB;
BEGIN
  IF p_recipient_id IS NULL THEN
    RETURN FALSE;
  END IF;

  SELECT p.notification_prefs
  INTO v_prefs
  FROM public.profiles p
  WHERE p.id = p_recipient_id;

  IF v_prefs IS NULL OR jsonb_typeof(v_prefs) <> 'object' THEN
    RETURN TRUE;
  END IF;

  IF jsonb_typeof(v_prefs->'mute_all') = 'boolean'
     AND (v_prefs->>'mute_all')::BOOLEAN IS TRUE THEN
    RETURN FALSE;
  END IF;

  v_categories := v_prefs->'categories';
  IF v_categories IS NOT NULL
     AND jsonb_typeof(v_categories) = 'object'
     AND p_pref_key IS NOT NULL THEN
    IF jsonb_typeof(v_categories->p_pref_key) = 'boolean'
       AND (v_categories->>p_pref_key)::BOOLEAN IS FALSE THEN
      RETURN FALSE;
    END IF;
  END IF;

  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.enqueue_user_notification(
  p_recipient_id UUID,
  p_actor_id UUID,
  p_category VARCHAR(24),
  p_pref_key TEXT,
  p_title VARCHAR(140),
  p_body VARCHAR(240) DEFAULT NULL,
  p_link_href VARCHAR(200) DEFAULT NULL,
  p_entity_key VARCHAR(120) DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_title VARCHAR(140);
  v_body VARCHAR(240);
  v_link VARCHAR(200);
  v_key VARCHAR(120);
BEGIN
  IF p_recipient_id IS NULL OR (p_actor_id IS NOT NULL AND p_actor_id = p_recipient_id) THEN
    RETURN;
  END IF;

  IF NOT public.is_notification_category_enabled(p_recipient_id, p_pref_key) THEN
    RETURN;
  END IF;

  v_title := left(COALESCE(NULLIF(btrim(p_title), ''), 'Nova notificação no Codit'), 140);
  v_body := NULLIF(left(btrim(COALESCE(p_body, '')), 240), '');
  v_link := CASE
    WHEN p_link_href IS NOT NULL AND left(btrim(p_link_href), 1) = '/'
      THEN left(btrim(p_link_href), 200)
    ELSE NULL
  END;
  v_key := NULLIF(left(btrim(COALESCE(p_entity_key, '')), 120), '');

  PERFORM set_config('codit.internal_notify_write', 'on', true);

  INSERT INTO public.notifications (
    recipient_id,
    actor_id,
    category,
    title,
    body,
    link_href,
    entity_key,
    read_at,
    created_at
  )
  VALUES (
    p_recipient_id,
    p_actor_id,
    p_category,
    v_title,
    v_body,
    v_link,
    v_key,
    NULL,
    NOW()
  )
  ON CONFLICT (recipient_id, entity_key) WHERE entity_key IS NOT NULL
  DO UPDATE SET
    actor_id = EXCLUDED.actor_id,
    title = EXCLUDED.title,
    body = EXCLUDED.body,
    link_href = EXCLUDED.link_href,
    read_at = NULL,
    created_at = NOW();

  PERFORM set_config('codit.internal_notify_write', 'off', true);

  DELETE FROM public.notifications
  WHERE id IN (
    SELECT n.id
    FROM public.notifications n
    WHERE n.recipient_id = p_recipient_id
    ORDER BY n.created_at DESC, n.id DESC
    OFFSET 60
  );
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('codit.internal_notify_write', 'off', true);
  RAISE;
END;
$$;

REVOKE ALL ON FUNCTION public.is_notification_category_enabled(UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enqueue_user_notification(UUID, UUID, VARCHAR, TEXT, VARCHAR, VARCHAR, VARCHAR, VARCHAR) FROM PUBLIC, anon, authenticated;

-- ==============================================================================
-- 5. Triggers de eventos sociais e grupos
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.notify_on_project_like()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner_id UUID;
  v_project_title TEXT;
  v_deleted_at TIMESTAMPTZ;
  v_actor_name TEXT;
BEGIN
  SELECT sp.user_id, sp.title, sp.deleted_at
  INTO v_owner_id, v_project_title, v_deleted_at
  FROM public.sandbox_projects sp
  WHERE sp.id = NEW.project_id;

  IF v_owner_id IS NULL OR v_deleted_at IS NOT NULL OR v_owner_id = NEW.user_id THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(NULLIF(btrim(p.full_name), ''), '@' || p.username, 'Alguém')
  INTO v_actor_name
  FROM public.profiles p
  WHERE p.id = NEW.user_id;

  PERFORM public.enqueue_user_notification(
    v_owner_id,
    NEW.user_id,
    'project_like',
    'project_likes',
    left(COALESCE(v_actor_name, 'Alguém') || ' curtiu seu projeto', 140),
    left(COALESCE(v_project_title, 'Projeto no Codit'), 240),
    '/comunidade?project=' || NEW.project_id::TEXT,
    'like:' || NEW.project_id::TEXT || ':' || NEW.user_id::TEXT
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_project_likes_notify ON public.project_likes;
CREATE TRIGGER trg_project_likes_notify
  AFTER INSERT ON public.project_likes
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_on_project_like();

CREATE OR REPLACE FUNCTION public.notify_on_project_comment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner_id UUID;
  v_project_title TEXT;
  v_deleted_at TIMESTAMPTZ;
  v_actor_name TEXT;
BEGIN
  SELECT sp.user_id, sp.title, sp.deleted_at
  INTO v_owner_id, v_project_title, v_deleted_at
  FROM public.sandbox_projects sp
  WHERE sp.id = NEW.project_id;

  IF v_owner_id IS NULL OR v_deleted_at IS NOT NULL OR v_owner_id = NEW.user_id THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(NULLIF(btrim(p.full_name), ''), '@' || p.username, 'Alguém')
  INTO v_actor_name
  FROM public.profiles p
  WHERE p.id = NEW.user_id;

  PERFORM public.enqueue_user_notification(
    v_owner_id,
    NEW.user_id,
    'project_comment',
    'project_comments',
    left(
      COALESCE(v_actor_name, 'Alguém') || ' comentou em "' || left(COALESCE(v_project_title, 'seu projeto'), 48) || '"',
      140
    ),
    left(btrim(COALESCE(NEW.content, '')), 220),
    '/comunidade?project=' || NEW.project_id::TEXT,
    'comment:' || NEW.id::TEXT
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_project_comments_notify ON public.project_comments;
CREATE TRIGGER trg_project_comments_notify
  AFTER INSERT ON public.project_comments
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_on_project_comment();

CREATE OR REPLACE FUNCTION public.notify_on_friendship_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_name TEXT;
  v_actor_username TEXT;
BEGIN
  IF TG_OP = 'INSERT' AND NEW.status = 'pending' THEN
    SELECT COALESCE(NULLIF(btrim(p.full_name), ''), '@' || p.username, 'Alguém'), p.username
    INTO v_actor_name, v_actor_username
    FROM public.profiles p
    WHERE p.id = NEW.requester_id;

    PERFORM public.enqueue_user_notification(
      NEW.addressee_id,
      NEW.requester_id,
      'friend_request',
      'friend_requests',
      left(COALESCE(v_actor_name, 'Alguém') || ' enviou um pedido de amizade', 140),
      CASE
        WHEN v_actor_username IS NOT NULL AND v_actor_username <> ''
          THEN '@' || v_actor_username || ' quer adicionar você no Codit.'
        ELSE 'Abra a lista de amigos para responder.'
      END,
      CASE
        WHEN v_actor_username IS NOT NULL AND v_actor_username <> ''
          THEN '/comunidade/perfil?u=' || v_actor_username
        ELSE '/comunidade'
      END,
      'friend_req:' || NEW.requester_id::TEXT
    );
  ELSIF TG_OP = 'UPDATE' AND OLD.status = 'pending' AND NEW.status = 'accepted' THEN
    SELECT COALESCE(NULLIF(btrim(p.full_name), ''), '@' || p.username, 'Alguém'), p.username
    INTO v_actor_name, v_actor_username
    FROM public.profiles p
    WHERE p.id = NEW.addressee_id;

    PERFORM public.enqueue_user_notification(
      NEW.requester_id,
      NEW.addressee_id,
      'friend_accepted',
      'friend_accepted',
      left(COALESCE(v_actor_name, 'Alguém') || ' aceitou seu pedido de amizade', 140),
      'Vocês já podem trocar mensagens e iniciar chamadas de voz.',
      '/mensagens?dm=' || NEW.addressee_id::TEXT,
      'friend_acc:' || NEW.addressee_id::TEXT
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_friendships_notify ON public.friendships;
CREATE TRIGGER trg_friendships_notify
  AFTER INSERT OR UPDATE ON public.friendships
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_on_friendship_event();

CREATE OR REPLACE FUNCTION public.notify_on_group_invite()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_kind VARCHAR(16);
  v_group_title TEXT;
  v_actor_name TEXT;
BEGIN
  IF NOT (
    (TG_OP = 'INSERT' AND NEW.left_at IS NULL)
    OR (TG_OP = 'UPDATE' AND OLD.left_at IS NOT NULL AND NEW.left_at IS NULL)
  ) THEN
    RETURN NEW;
  END IF;

  IF NEW.added_by IS NULL OR NEW.added_by = NEW.user_id THEN
    RETURN NEW;
  END IF;

  SELECT c.kind, c.title
  INTO v_kind, v_group_title
  FROM public.chat_conversations c
  WHERE c.id = NEW.conversation_id;

  IF v_kind IS DISTINCT FROM 'group' THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(NULLIF(btrim(p.full_name), ''), '@' || p.username, 'Alguém')
  INTO v_actor_name
  FROM public.profiles p
  WHERE p.id = NEW.added_by;

  PERFORM public.enqueue_user_notification(
    NEW.user_id,
    NEW.added_by,
    'group_invite',
    'group_invites',
    left(
      COALESCE(v_actor_name, 'Alguém') || ' adicionou você ao grupo "' || left(COALESCE(v_group_title, 'Grupo Codit'), 60) || '"',
      140
    ),
    'Toque para abrir a conversa do grupo.',
    '/mensagens?c=' || NEW.conversation_id::TEXT,
    'group_inv:' || NEW.conversation_id::TEXT
  );

  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF to_regclass('public.chat_conversation_members') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS trg_chat_group_invite_notify ON public.chat_conversation_members;
    CREATE TRIGGER trg_chat_group_invite_notify
      AFTER INSERT OR UPDATE ON public.chat_conversation_members
      FOR EACH ROW
      EXECUTE FUNCTION public.notify_on_group_invite();
  END IF;
END
$$;

-- ==============================================================================
-- 6. RPCs autenticadas de leitura/limpeza em lote
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.mark_all_notifications_read()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_updated INTEGER := 0;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Autenticação obrigatória para marcar notificações como lidas.'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.notifications
  SET read_at = NOW()
  WHERE recipient_id = v_user_id
    AND read_at IS NULL;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated;
END;
$$;

CREATE OR REPLACE FUNCTION public.clear_read_notifications()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_deleted INTEGER := 0;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Autenticação obrigatória para limpar notificações.'
      USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.notifications
  WHERE recipient_id = v_user_id
    AND read_at IS NOT NULL;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_all_notifications_read() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_all_notifications_read() TO authenticated;

REVOKE ALL ON FUNCTION public.clear_read_notifications() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.clear_read_notifications() TO authenticated;

-- ==============================================================================
-- 7. Realtime & recarga de schema PostgREST
-- ==============================================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_publication
    WHERE pubname = 'supabase_realtime'
  ) THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'notifications'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
    END IF;
  END IF;
END
$$;

NOTIFY pgrst, 'reload schema';
