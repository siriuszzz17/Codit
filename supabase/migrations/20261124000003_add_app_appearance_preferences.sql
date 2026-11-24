-- ==============================================================================
-- Codit (TCC-Codit) — Preferências Leves de Aparência (Tema & Papel de Parede)
-- ==============================================================================
-- Armazena apenas 4 identificadores curtos em `public.profiles` (~52 bytes/linha):
--   - zero binários/uploads ou impacto de armazenamento
--   - não exposto em `public.public_profiles` (preferência privada do usuário)
--   - idempotente para execução segura no SQL Editor do Supabase
-- ==============================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS color_mode VARCHAR(12) NOT NULL DEFAULT 'system',
  ADD COLUMN IF NOT EXISTS app_theme VARCHAR(24) NOT NULL DEFAULT 'original',
  ADD COLUMN IF NOT EXISTS wallpaper_preset VARCHAR(32) NOT NULL DEFAULT 'original',
  ADD COLUMN IF NOT EXISTS wallpaper_intensity VARCHAR(12) NOT NULL DEFAULT 'balanced';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_profiles_color_mode'
      AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT chk_profiles_color_mode
      CHECK (color_mode IN ('system', 'light', 'dark'));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_profiles_app_theme'
      AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT chk_profiles_app_theme
      CHECK (
        app_theme IN (
          'original',
          'ocean_circuit',
          'amber_terminal',
          'forest_syntax',
          'nordic_frost',
          'mono_graphite'
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_profiles_wallpaper_preset'
      AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT chk_profiles_wallpaper_preset
      CHECK (
        wallpaper_preset IN (
          'original',
          'blueprint_grid',
          'circuit_traces',
          'topographic_flow',
          'constellation_nodes',
          'isometric_matrix',
          'aurora_mesh',
          'minimal_paper'
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_profiles_wallpaper_intensity'
      AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT chk_profiles_wallpaper_intensity
      CHECK (wallpaper_intensity IN ('subtle', 'balanced', 'vivid'));
  END IF;
END
$$;

NOTIFY pgrst, 'reload schema';
