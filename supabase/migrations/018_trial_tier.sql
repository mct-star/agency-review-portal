-- Trial tier support
-- Adds trial metadata to companies without changing the PlanTier enum.
-- During an active trial, the app treats the company as if they're on trial_plan tier.
-- When trial expires, they fall back to their base plan (usually "free").

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS trial_started_at timestamptz DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS trial_expires_at timestamptz DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS trial_plan text DEFAULT NULL
    CHECK (trial_plan IS NULL OR trial_plan IN ('pro', 'agency'));

-- Index for querying active/expired trials
CREATE INDEX IF NOT EXISTS idx_companies_trial_expires
  ON public.companies (trial_expires_at)
  WHERE trial_expires_at IS NOT NULL;
