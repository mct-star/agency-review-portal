-- Migration 005: Add spokesperson_tagline to companies table
-- Safe to re-run (uses IF NOT EXISTS pattern)

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'companies' AND column_name = 'spokesperson_tagline'
  ) THEN
    ALTER TABLE companies ADD COLUMN spokesperson_tagline text;
  END IF;
END $$;

-- Set default for AGENCY Bristol
UPDATE companies
SET spokesperson_tagline = 'Founder, AGENCY Medical Marketing | Healthcare Demand Generation'
WHERE slug = 'agency-bristol' AND spokesperson_tagline IS NULL;
