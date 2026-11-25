-- ==============================================================================
-- Codit (TCC-Codit) — Sessões de Chamada (`ringing` 60s) & Suporte a Reply Push
-- ==============================================================================
-- Registra sessões de chamada com estado `ringing` e expiração de 60 segundos
-- para coordenação server-side na Edge Function `send-push` (timeout/missed,
-- cancelamento e atendimento).
-- ==============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.call_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL
    CONSTRAINT fk_call_sessions_conversation_id
      REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
  caller_id UUID NOT NULL
    CONSTRAINT fk_call_sessions_caller_id
      REFERENCES public.profiles(id) ON DELETE CASCADE,
  answered_by UUID
    CONSTRAINT fk_call_sessions_answered_by
      REFERENCES public.profiles(id) ON DELETE SET NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'ringing'
    CONSTRAINT chk_call_sessions_status
      CHECK (status IN ('ringing', 'active', 'ended', 'missed', 'cancelled')),
  has_video BOOLEAN NOT NULL DEFAULT FALSE,
  ringing_timeout_seconds INTEGER NOT NULL DEFAULT 60
    CONSTRAINT chk_call_sessions_timeout_seconds
      CHECK (ringing_timeout_seconds BETWEEN 10 AND 120),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '60 seconds'),
  answered_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  end_reason VARCHAR(32)
);

CREATE INDEX IF NOT EXISTS idx_call_sessions_conversation_status
  ON public.call_sessions (conversation_id, status, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_call_sessions_ringing_expires
  ON public.call_sessions (expires_at)
  WHERE status = 'ringing';

ALTER TABLE public.call_sessions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.call_sessions FROM PUBLIC, anon;
GRANT SELECT ON public.call_sessions TO authenticated;

DROP POLICY IF EXISTS call_sessions_select_member ON public.call_sessions;
CREATE POLICY call_sessions_select_member
  ON public.call_sessions
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.chat_conversation_members m
      WHERE m.conversation_id = call_sessions.conversation_id
        AND m.user_id = auth.uid()
        AND m.left_at IS NULL
    )
  );

NOTIFY pgrst, 'reload schema';
