-- Migration 011: Brand mask URL on companies
-- Each company can upload a transparent PNG mask template that gets
-- composited on top of every generated image.
-- Safe to re-run (uses IF NOT EXISTS pattern).

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'companies' AND column_name = 'brand_mask_url'
  ) THEN
    ALTER TABLE public.companies ADD COLUMN brand_mask_url text;
  END IF;
END $$;

COMMENT ON COLUMN public.companies.brand_mask_url IS
  'URL of a transparent PNG mask overlaid on every generated image. '
  'Should be 1:1 (1080x1080 or 1024x1024) with transparency where the '
  'base image shows through. Uploaded via Setup > Company Brand.';
