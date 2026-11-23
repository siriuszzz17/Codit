-- ==============================================================================
-- Codit (TCC-Codit) — Migração Fase 3 (Idempotente)
-- Expande public.profiles (personalização visual/carreira) e
-- public.sandbox_projects (15 linguagens, fixação, tags e links de portfólio)
-- ==============================================================================

-- ==============================================================================
-- 1. Expansão de public.profiles
-- ==============================================================================
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS headline VARCHAR(120),
  ADD COLUMN IF NOT EXISTS location VARCHAR(80),
  ADD COLUMN IF NOT EXISTS website_url TEXT,
  ADD COLUMN IF NOT EXISTS linkedin_url TEXT,
  ADD COLUMN IF NOT EXISTS banner_preset VARCHAR(40) NOT NULL DEFAULT 'nebula',
  ADD COLUMN IF NOT EXISTS accent_theme VARCHAR(30) NOT NULL DEFAULT 'violet',
  ADD COLUMN IF NOT EXISTS avatar_frame VARCHAR(30) NOT NULL DEFAULT 'glow',
  ADD COLUMN IF NOT EXISTS octopy_companion VARCHAR(20) NOT NULL DEFAULT 'coding',
  ADD COLUMN IF NOT EXISTS skills TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS show_email BOOLEAN NOT NULL DEFAULT FALSE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_profiles_website_url'
      AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT chk_profiles_website_url
      CHECK (website_url IS NULL OR website_url ~ '^https?://');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_profiles_linkedin_url'
      AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT chk_profiles_linkedin_url
      CHECK (linkedin_url IS NULL OR linkedin_url ~ '^https?://');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_profiles_banner_preset'
      AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT chk_profiles_banner_preset
      CHECK (
        banner_preset IN (
          'nebula',
          'aurora',
          'midnight_grid',
          'sunset_code',
          'emerald_matrix',
          'cyber_ocean'
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_profiles_accent_theme'
      AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT chk_profiles_accent_theme
      CHECK (
        accent_theme IN (
          'violet',
          'cyan',
          'emerald',
          'amber',
          'rose',
          'indigo'
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_profiles_avatar_frame'
      AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT chk_profiles_avatar_frame
      CHECK (
        avatar_frame IN (
          'none',
          'glow',
          'pixel',
          'gradient',
          'emerald'
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_profiles_octopy_companion'
      AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT chk_profiles_octopy_companion
      CHECK (
        octopy_companion IN (
          'default',
          'coding',
          'headphones',
          'happy'
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_profiles_skills_limit'
      AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT chk_profiles_skills_limit
      CHECK (cardinality(skills) <= 12);
  END IF;
END
$$;

-- ==============================================================================
-- 2. Expansão de public.sandbox_projects
-- ==============================================================================
ALTER TABLE public.sandbox_projects
  DROP CONSTRAINT IF EXISTS chk_sandbox_projects_language;

ALTER TABLE public.sandbox_projects
  ADD CONSTRAINT chk_sandbox_projects_language
  CHECK (
    primary_language IN (
      'html_css_js',
      'html',
      'css',
      'javascript',
      'typescript',
      'python',
      'react',
      'nodejs',
      'java',
      'csharp',
      'cpp',
      'go',
      'rust',
      'sql',
      'php'
    )
  );

ALTER TABLE public.sandbox_projects
  ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS repository_url TEXT,
  ADD COLUMN IF NOT EXISTS live_url TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_sandbox_projects_tags_limit'
      AND conrelid = 'public.sandbox_projects'::regclass
  ) THEN
    ALTER TABLE public.sandbox_projects
      ADD CONSTRAINT chk_sandbox_projects_tags_limit
      CHECK (cardinality(tags) <= 6);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_sandbox_projects_repo_url'
      AND conrelid = 'public.sandbox_projects'::regclass
  ) THEN
    ALTER TABLE public.sandbox_projects
      ADD CONSTRAINT chk_sandbox_projects_repo_url
      CHECK (repository_url IS NULL OR repository_url ~ '^https?://');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_sandbox_projects_live_url'
      AND conrelid = 'public.sandbox_projects'::regclass
  ) THEN
    ALTER TABLE public.sandbox_projects
      ADD CONSTRAINT chk_sandbox_projects_live_url
      CHECK (live_url IS NULL OR live_url ~ '^https?://');
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_projects_user_pinned_updated
  ON public.sandbox_projects (user_id, is_pinned DESC, updated_at DESC)
  WHERE deleted_at IS NULL;
