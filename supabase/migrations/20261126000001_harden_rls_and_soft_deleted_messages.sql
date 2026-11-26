-- ==============================================================================
-- Codit (TCC-Codit) — Hardening de RLS / SECURITY DEFINER & Redação de Mensagens
-- ==============================================================================
-- Corrige 3 brechas críticas identificadas na auditoria de segurança:
-- 1. public.are_users_friends(UUID, UUID): impede enumeração do grafo de amizades
--    por 3º usuário autenticado (somente participantes ou contexto privilegiado).
-- 2. public.is_active_chat_member(UUID, UUID): impede enumeração de participação
--    de terceiros em conversas (somente auth.uid() ou contexto privilegiado).
-- 3. public.guard_chat_message_update(): redige automaticamente o conteúdo de
--    mensagens ao efetuar soft-delete (`[Mensagem removida]`) para evitar
--    vazamento de texto excluído em leituras de tabela/Realtime.
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
        auth.uid() IS NULL
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

  IF NEW.content IS DISTINCT FROM OLD.content THEN
    RAISE EXCEPTION 'Conteúdo da mensagem não pode ser alterado.'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

UPDATE public.chat_messages
SET content = '[Mensagem removida]'
WHERE deleted_at IS NOT NULL
  AND content <> '[Mensagem removida]';

REVOKE EXECUTE ON FUNCTION public.are_users_friends(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.are_users_friends(UUID, UUID) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.is_active_chat_member(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_active_chat_member(UUID, UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';
