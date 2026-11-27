-- ==============================================================================
-- Codit (TCC-Codit) — Migração Estúdio Multi-Arquivo e Histórico de Versões
-- Adiciona coluna `files` JSONB em `public.sandbox_projects` e cria
-- `public.sandbox_project_versions` com RLS restrito ao dono do projeto.
-- ==============================================================================

-- 1. Suporte a múltiplos arquivos (index.html, styles.css, script.js)
ALTER TABLE public.sandbox_projects
  ADD COLUMN IF NOT EXISTS files JSONB;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_sandbox_projects_files_object'
      AND conrelid = 'public.sandbox_projects'::regclass
  ) THEN
    ALTER TABLE public.sandbox_projects
      ADD CONSTRAINT chk_sandbox_projects_files_object
      CHECK (
        files IS NULL
        OR (
          jsonb_typeof(files) = 'object'
          AND octet_length(files::text) <= 300000
        )
      );
  END IF;
END
$$;

-- 2. Histórico de snapshots de versão por projeto
CREATE TABLE IF NOT EXISTS public.sandbox_project_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL
    CONSTRAINT fk_sandbox_project_versions_project_id
      REFERENCES public.sandbox_projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL
    CONSTRAINT fk_sandbox_project_versions_user_id
      REFERENCES public.profiles(id) ON DELETE CASCADE,
  version INTEGER NOT NULL
    CONSTRAINT chk_sandbox_project_versions_version CHECK (version >= 1),
  title VARCHAR(120) NOT NULL
    CONSTRAINT chk_sandbox_project_versions_title CHECK (char_length(btrim(title)) > 0),
  primary_language VARCHAR(30) NOT NULL,
  source_code TEXT NOT NULL DEFAULT ''
    CONSTRAINT chk_sandbox_project_versions_source_size CHECK (char_length(source_code) <= 200000),
  files JSONB
    CONSTRAINT chk_sandbox_project_versions_files_object CHECK (
      files IS NULL
      OR (
        jsonb_typeof(files) = 'object'
        AND octet_length(files::text) <= 300000
      )
    ),
  summary VARCHAR(140),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_sandbox_project_versions_project_version UNIQUE (project_id, version)
);

CREATE INDEX IF NOT EXISTS idx_sandbox_project_versions_project_version
  ON public.sandbox_project_versions (project_id, version DESC);

CREATE INDEX IF NOT EXISTS idx_sandbox_project_versions_user_created
  ON public.sandbox_project_versions (user_id, created_at DESC);

GRANT SELECT, INSERT, DELETE ON public.sandbox_project_versions TO authenticated;

ALTER TABLE public.sandbox_project_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sandbox_project_versions_select_own ON public.sandbox_project_versions;
CREATE POLICY sandbox_project_versions_select_own
  ON public.sandbox_project_versions
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1
      FROM public.sandbox_projects sp
      WHERE sp.id = project_id
        AND sp.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS sandbox_project_versions_insert_own ON public.sandbox_project_versions;
CREATE POLICY sandbox_project_versions_insert_own
  ON public.sandbox_project_versions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1
      FROM public.sandbox_projects sp
      WHERE sp.id = project_id
        AND sp.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS sandbox_project_versions_delete_own ON public.sandbox_project_versions;
CREATE POLICY sandbox_project_versions_delete_own
  ON public.sandbox_project_versions
  FOR DELETE
  TO authenticated
  USING (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1
      FROM public.sandbox_projects sp
      WHERE sp.id = project_id
        AND sp.user_id = auth.uid()
    )
  );
