-- Company details enrichment fields
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS tagline text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS description text DEFAULT NULL;

COMMENT ON COLUMN public.companies.tagline IS 'Company tagline/strapline';
COMMENT ON COLUMN public.companies.description IS 'Brief company description, auto-enriched from website or manually entered';

-- Voice profile document storage (uploaded docs for voice analysis)
ALTER TABLE public.company_voice_profiles
  ADD COLUMN IF NOT EXISTS source_document_url text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS source_document_name text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS ai_voice_detected boolean DEFAULT false;

COMMENT ON COLUMN public.company_voice_profiles.source_document_url IS 'URL of uploaded document used for voice extraction';
COMMENT ON COLUMN public.company_voice_profiles.source_document_name IS 'Original filename of uploaded document';
COMMENT ON COLUMN public.company_voice_profiles.ai_voice_detected IS 'Whether AI-generated writing patterns were detected in the samples';
