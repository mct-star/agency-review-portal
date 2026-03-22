-- ============================================================
-- Migration 017: Regulatory Compliance Module
-- Adds regulatory review fields to content_pieces and
-- regulatory framework config to companies.
-- ============================================================

-- 1. Add regulatory review columns to content_pieces
ALTER TABLE public.content_pieces
  ADD COLUMN IF NOT EXISTS regulatory_status text DEFAULT 'pending'
    CHECK (regulatory_status IN ('pending', 'clean', 'flagged', 'approved')),
  ADD COLUMN IF NOT EXISTS regulatory_score integer
    CHECK (regulatory_score IS NULL OR (regulatory_score >= 0 AND regulatory_score <= 100)),
  ADD COLUMN IF NOT EXISTS regulatory_review jsonb,
  ADD COLUMN IF NOT EXISTS regulatory_framework text,
  ADD COLUMN IF NOT EXISTS regulatory_reviewed_at timestamptz;

COMMENT ON COLUMN public.content_pieces.regulatory_status IS 'Compliance status: pending, clean, flagged, or approved';
COMMENT ON COLUMN public.content_pieces.regulatory_score IS 'Compliance score 0-100 (100 = fully compliant)';
COMMENT ON COLUMN public.content_pieces.regulatory_review IS 'Full JSON review result from compliance check';
COMMENT ON COLUMN public.content_pieces.regulatory_framework IS 'Which framework was used for the review';
COMMENT ON COLUMN public.content_pieces.regulatory_reviewed_at IS 'Timestamp of last regulatory review';

-- 2. Add regulatory framework config to companies
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS regulatory_framework text DEFAULT 'general_healthcare',
  ADD COLUMN IF NOT EXISTS auto_regulatory_review boolean DEFAULT false;

COMMENT ON COLUMN public.companies.regulatory_framework IS 'Default regulatory framework: abpi, fda, mhra, eu_mdr, general_healthcare, custom';
COMMENT ON COLUMN public.companies.auto_regulatory_review IS 'Auto-run compliance review on new content generation';

-- 3. Index for compliance dashboard queries
CREATE INDEX IF NOT EXISTS idx_content_pieces_regulatory_status
  ON public.content_pieces(regulatory_status);
CREATE INDEX IF NOT EXISTS idx_content_pieces_company_regulatory
  ON public.content_pieces(company_id, regulatory_status);
