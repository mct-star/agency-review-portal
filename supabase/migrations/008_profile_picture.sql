-- Migration 008: Add profile_picture_url to companies
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'companies' AND column_name = 'profile_picture_url'
  ) THEN
    ALTER TABLE public.companies ADD COLUMN profile_picture_url text;
  END IF;
END $$;
