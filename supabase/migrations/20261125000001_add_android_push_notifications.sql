-- ==============================================================================
-- Codit (TCC-Codit) — Push Notifications Nativas Android (FCM HTTP v1)
-- ==============================================================================
-- Registra tokens FCM por usuário em `public.push_devices` (RLS estrita + poda
-- em 10 dispositivos por conta) e dispara webhook opcional não bloqueante via
-- `pg_net` + Supabase Vault para a Edge Function `send-push`.
-- ==============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ==============================================================================
-- 1. Tabela `public.push_devices`
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.push_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL
    CONSTRAINT fk_push_devices_user_id REFERENCES public.profiles(id) ON DELETE CASCADE,
  platform VARCHAR(16) NOT NULL DEFAULT 'android'
    CONSTRAINT chk_push_devices_platform CHECK (platform IN ('android')),
  token TEXT NOT NULL
    CONSTRAINT chk_push_devices_token_length CHECK (char_length(btrim(token)) BETWEEN 20 AND 4096),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_push_devices_token UNIQUE (token)
);

CREATE INDEX IF NOT EXISTS idx_push_devices_user_id
  ON public.push_devices (user_id, last_seen_at DESC);

ALTER TABLE public.push_devices ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.push_devices FROM PUBLIC, anon;
GRANT SELECT, DELETE ON public.push_devices TO authenticated;

DROP POLICY IF EXISTS push_devices_select_own ON public.push_devices;
CREATE POLICY push_devices_select_own
  ON public.push_devices
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS push_devices_delete_own ON public.push_devices;
CREATE POLICY push_devices_delete_own
  ON public.push_devices
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- ==============================================================================
-- 2. RPCs autenticadas de registro e revogação de dispositivo
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.register_push_device(
  p_token TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_clean_token TEXT;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Autenticação obrigatória para registrar notificações push.'
      USING ERRCODE = '42501';
  END IF;

  v_clean_token := NULLIF(btrim(COALESCE(p_token, '')), '');
  IF v_clean_token IS NULL OR char_length(v_clean_token) < 20 OR char_length(v_clean_token) > 4096 THEN
    RAISE EXCEPTION 'Token de dispositivo inválido.'
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.push_devices (user_id, platform, token, updated_at, last_seen_at)
  VALUES (v_user_id, 'android', v_clean_token, NOW(), NOW())
  ON CONFLICT (token)
  DO UPDATE SET
    user_id = EXCLUDED.user_id,
    platform = 'android',
    updated_at = NOW(),
    last_seen_at = NOW();

  UPDATE public.profiles
  SET notification_prefs = jsonb_set(
    COALESCE(notification_prefs, '{}'::jsonb),
    '{browser_push_enabled}',
    'true'::jsonb,
    true
  )
  WHERE id = v_user_id
    AND COALESCE((notification_prefs->>'browser_push_enabled')::boolean, false) = false;

  DELETE FROM public.push_devices
  WHERE id IN (
    SELECT pd.id
    FROM public.push_devices pd
    WHERE pd.user_id = v_user_id
    ORDER BY pd.last_seen_at DESC, pd.id DESC
    OFFSET 10
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.unregister_push_device(
  p_token TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_clean_token TEXT;
BEGIN
  v_clean_token := NULLIF(btrim(COALESCE(p_token, '')), '');
  IF v_user_id IS NULL OR v_clean_token IS NULL THEN
    RETURN;
  END IF;

  DELETE FROM public.push_devices
  WHERE user_id = v_user_id
    AND token = v_clean_token;
END;
$$;

REVOKE ALL ON FUNCTION public.register_push_device(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_push_device(TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.unregister_push_device(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.unregister_push_device(TEXT) TO authenticated;

-- ==============================================================================
-- 3. Despacho não bloqueante via pg_net + Vault (opcional; compatível com Dashboard Webhooks)
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.notify_push_edge_on_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_has_devices BOOLEAN := FALSE;
  v_url TEXT;
  v_secret TEXT;
BEGIN
  IF TG_TABLE_NAME = 'notifications' THEN
    IF NEW.read_at IS NOT NULL THEN
      RETURN NEW;
    END IF;

    SELECT EXISTS (
      SELECT 1
      FROM public.push_devices pd
      WHERE pd.user_id = NEW.recipient_id
    )
    INTO v_has_devices;
  ELSIF TG_TABLE_NAME = 'chat_messages' THEN
    IF NEW.message_type <> 'text' OR NEW.deleted_at IS NOT NULL THEN
      RETURN NEW;
    END IF;

    SELECT EXISTS (
      SELECT 1
      FROM public.chat_conversation_members m
      JOIN public.push_devices pd ON pd.user_id = m.user_id
      WHERE m.conversation_id = NEW.conversation_id
        AND m.left_at IS NULL
        AND m.user_id <> NEW.sender_id
    )
    INTO v_has_devices;
  END IF;

  IF NOT v_has_devices THEN
    RETURN NEW;
  END IF;

  IF to_regnamespace('net') IS NOT NULL AND to_regnamespace('vault') IS NOT NULL THEN
    BEGIN
      EXECUTE 'SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = $1 LIMIT 1'
        INTO v_url
        USING 'codit_push_webhook_url';
      EXECUTE 'SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = $1 LIMIT 1'
        INTO v_secret
        USING 'codit_push_webhook_secret';

      v_url := NULLIF(btrim(COALESCE(v_url, '')), '');
      v_secret := NULLIF(btrim(COALESCE(v_secret, '')), '');

      IF v_url IS NOT NULL AND v_secret IS NOT NULL THEN
        PERFORM net.http_post(
          url := v_url,
          body := jsonb_build_object(
            'type', TG_OP,
            'schema', TG_TABLE_SCHEMA,
            'table', TG_TABLE_NAME,
            'record', to_jsonb(NEW)
          ),
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'x-codit-webhook-secret', v_secret
          ),
          timeout_milliseconds := 5000
        );
      END IF;
    EXCEPTION WHEN OTHERS THEN
      -- Falha no despacho HTTP assíncrono não deve bloquear gravações no banco.
      NULL;
    END;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_push_edge_on_event() FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
  IF to_regclass('public.notifications') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS trg_notifications_push_edge ON public.notifications;
    CREATE TRIGGER trg_notifications_push_edge
      AFTER INSERT OR UPDATE ON public.notifications
      FOR EACH ROW
      EXECUTE FUNCTION public.notify_push_edge_on_event();
  END IF;

  IF to_regclass('public.chat_messages') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS trg_chat_messages_push_edge ON public.chat_messages;
    CREATE TRIGGER trg_chat_messages_push_edge
      AFTER INSERT ON public.chat_messages
      FOR EACH ROW
      EXECUTE FUNCTION public.notify_push_edge_on_event();
  END IF;
END
$$;

NOTIFY pgrst, 'reload schema';
