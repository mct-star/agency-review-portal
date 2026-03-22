-- Add per-person content setup fields to spokespersons
ALTER TABLE public.company_spokespersons
  ADD COLUMN IF NOT EXISTS topic_assignments jsonb DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS posting_schedule jsonb DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS signoff_template text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS content_strategy text DEFAULT NULL;

COMMENT ON COLUMN public.company_spokespersons.topic_assignments IS 'Array of topic_bank IDs assigned to this person';
COMMENT ON COLUMN public.company_spokespersons.posting_schedule IS 'Per-person posting schedule overrides';
COMMENT ON COLUMN public.company_spokespersons.signoff_template IS 'Personal sign-off text (overrides company default)';
COMMENT ON COLUMN public.company_spokespersons.content_strategy IS 'Free-text content strategy notes for this person';
