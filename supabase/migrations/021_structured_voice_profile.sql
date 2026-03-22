-- Structured voice profile data (replaces free-text with structured fields)
-- Stored as JSONB to allow flexible schema evolution without migrations.
-- The structured_voice column holds the full voice specification:
-- tone_spectrum, formatting_rules, humour_style, hedging, banned_words_categorised,
-- writing_samples_structured, opening_rules, peer_positioning, voice_three_words, etc.

ALTER TABLE public.company_voice_profiles
  ADD COLUMN IF NOT EXISTS structured_voice jsonb DEFAULT NULL;

COMMENT ON COLUMN public.company_voice_profiles.structured_voice IS 'Structured voice profile data: tone spectrum, formatting rules, humour style, hedging, banned words by category, writing samples, opening rules, etc.';
