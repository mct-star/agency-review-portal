-- 045: strategy share links expire and can be revoked; compliance documents
-- record their storage path so they can be served from the private bucket.
-- Phase 0 of the October 2026 platform strategy audit. Safe to re-run.

ALTER TABLE public.strategy_documents
  ADD COLUMN IF NOT EXISTS share_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS share_revoked_at timestamptz;

-- Links made before this migration had 44-bit tokens with no expiry. Give
-- them 30 days from now rather than cutting them off at once.
UPDATE public.strategy_documents
SET share_expires_at = now() + interval '30 days'
WHERE share_token IS NOT NULL AND share_expires_at IS NULL;

ALTER TABLE public.company_compliance_documents
  ADD COLUMN IF NOT EXISTS storage_path text;

-- file_url used to be a public URL and was NOT NULL. New rows store the
-- private path and an empty file_url; the API signs a URL at read time.
ALTER TABLE public.company_compliance_documents
  ALTER COLUMN file_url DROP NOT NULL;
