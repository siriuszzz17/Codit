-- ==============================================================================
-- Codit (TCC-Codit) — Sincronização de Personalização Visual no Perfil Público
-- Espelha atributos visuais e de portfólio (sem PII) de `public.profiles` para
-- `public.public_profiles`, atualiza `sync_public_profile()` e faz backfill.
-- ==============================================================================
-- Privacidade garantida:
-- NUNCA espelha `email`, `role`, `username_changed_at` ou `show_email` em
-- `public.public_profiles`.
-- ==============================================================================

-- 1. Garante idempotentemente colunas de personalização em `public.profiles`
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

-- 2. Adiciona as 9 colunas não-PII de personalização em `public.public_profiles`
ALTER TABLE public.public_profiles
  ADD COLUMN IF NOT EXISTS headline VARCHAR(120),
  ADD COLUMN IF NOT EXISTS location VARCHAR(80),
  ADD COLUMN IF NOT EXISTS website_url TEXT,
  ADD COLUMN IF NOT EXISTS linkedin_url TEXT,
  ADD COLUMN IF NOT EXISTS banner_preset VARCHAR(40) NOT NULL DEFAULT 'nebula',
  ADD COLUMN IF NOT EXISTS accent_theme VARCHAR(30) NOT NULL DEFAULT 'violet',
  ADD COLUMN IF NOT EXISTS avatar_frame VARCHAR(30) NOT NULL DEFAULT 'glow',
  ADD COLUMN IF NOT EXISTS octopy_companion VARCHAR(20) NOT NULL DEFAULT 'coding',
  ADD COLUMN IF NOT EXISTS skills TEXT[] NOT NULL DEFAULT '{}';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_public_profiles_website_url'
      AND conrelid = 'public.public_profiles'::regclass
  ) THEN
    ALTER TABLE public.public_profiles
      ADD CONSTRAINT chk_public_profiles_website_url
      CHECK (website_url IS NULL OR website_url ~ '^https?://');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_public_profiles_linkedin_url'
      AND conrelid = 'public.public_profiles'::regclass
  ) THEN
    ALTER TABLE public.public_profiles
      ADD CONSTRAINT chk_public_profiles_linkedin_url
      CHECK (linkedin_url IS NULL OR linkedin_url ~ '^https?://');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_public_profiles_banner_preset'
      AND conrelid = 'public.public_profiles'::regclass
  ) THEN
    ALTER TABLE public.public_profiles
      ADD CONSTRAINT chk_public_profiles_banner_preset
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
    WHERE conname = 'chk_public_profiles_accent_theme'
      AND conrelid = 'public.public_profiles'::regclass
  ) THEN
    ALTER TABLE public.public_profiles
      ADD CONSTRAINT chk_public_profiles_accent_theme
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
    WHERE conname = 'chk_public_profiles_avatar_frame'
      AND conrelid = 'public.public_profiles'::regclass
  ) THEN
    ALTER TABLE public.public_profiles
      ADD CONSTRAINT chk_public_profiles_avatar_frame
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
    WHERE conname = 'chk_public_profiles_octopy_companion'
      AND conrelid = 'public.public_profiles'::regclass
  ) THEN
    ALTER TABLE public.public_profiles
      ADD CONSTRAINT chk_public_profiles_octopy_companion
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
    WHERE conname = 'chk_public_profiles_skills_limit'
      AND conrelid = 'public.public_profiles'::regclass
  ) THEN
    ALTER TABLE public.public_profiles
      ADD CONSTRAINT chk_public_profiles_skills_limit
      CHECK (cardinality(skills) <= 12);
  END IF;
END
$$;

-- 3. Atualiza trigger `sync_public_profile` para espelhar os 17 campos públicos (sem PII)
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
    updated_at = EXCLUDED.updated_at;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_sync_public_profile ON public.profiles;
CREATE TRIGGER trg_profiles_sync_public_profile
  AFTER INSERT OR UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_public_profile();

-- 4. Backfill idempotente de todos os perfis existentes em `public.public_profiles`
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
  headline,
  location,
  website_url,
  linkedin_url,
  COALESCE(banner_preset, 'nebula'),
  COALESCE(accent_theme, 'violet'),
  COALESCE(avatar_frame, 'glow'),
  COALESCE(octopy_companion, 'coding'),
  COALESCE(skills, '{}'),
  created_at,
  updated_at
FROM public.profiles
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
  updated_at = EXCLUDED.updated_at;

-- 5. Reafirma RLS e privilégio mínimo somente leitura em `public.public_profiles`
ALTER TABLE public.public_profiles ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.public_profiles FROM anon, authenticated;
GRANT SELECT ON TABLE public.public_profiles TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
