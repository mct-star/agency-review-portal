-- ============================================================
-- CONSOLIDATED PENDING MIGRATIONS (018-022)
-- ============================================================
-- Run this in Supabase Dashboard > SQL Editor
-- All statements are idempotent (IF NOT EXISTS / IF NOT EXISTS)
-- Safe to run multiple times.
-- ============================================================

-- ┌──────────────────────────────────────────────┐
-- │ 018: Trial Tier Support                      │
-- └──────────────────────────────────────────────┘

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS trial_started_at timestamptz DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS trial_expires_at timestamptz DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS trial_plan text DEFAULT NULL;

-- Add check constraint separately (IF NOT EXISTS not supported for constraints)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'companies_trial_plan_check'
  ) THEN
    ALTER TABLE public.companies
      ADD CONSTRAINT companies_trial_plan_check
      CHECK (trial_plan IS NULL OR trial_plan IN ('pro', 'agency'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_companies_trial_expires
  ON public.companies (trial_expires_at)
  WHERE trial_expires_at IS NOT NULL;

-- ┌──────────────────────────────────────────────┐
-- │ 019: Image Style & Reference Photos          │
-- └──────────────────────────────────────────────┘

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS preferred_image_styles jsonb DEFAULT NULL;

ALTER TABLE public.company_spokespersons
  ADD COLUMN IF NOT EXISTS appearance_description text DEFAULT NULL;

ALTER TABLE public.company_spokespersons
  ADD COLUMN IF NOT EXISTS reference_photos jsonb DEFAULT '[]'::jsonb;

CREATE TABLE IF NOT EXISTS public.company_asset_templates (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  description text,
  image_url text not null,
  category text not null check (category in ('social_template', 'brand_element', 'style_reference')),
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

CREATE INDEX IF NOT EXISTS idx_asset_templates_company
  ON public.company_asset_templates(company_id);

ALTER TABLE public.company_asset_templates ENABLE ROW LEVEL SECURITY;

-- Policies (drop first to avoid "already exists" errors on re-run)
DROP POLICY IF EXISTS "Admin manages asset templates" ON public.company_asset_templates;
CREATE POLICY "Admin manages asset templates" ON public.company_asset_templates
  FOR ALL USING (public.get_user_role() = 'admin');

DROP POLICY IF EXISTS "Client reads own asset templates" ON public.company_asset_templates;
CREATE POLICY "Client reads own asset templates" ON public.company_asset_templates
  FOR SELECT USING (company_id = public.get_user_company_id());

-- ┌──────────────────────────────────────────────┐
-- │ 020: Company Details & Voice Documents       │
-- └──────────────────────────────────────────────┘

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS tagline text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS description text DEFAULT NULL;

-- Voice profile document storage (only if table exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'company_voice_profiles') THEN
    ALTER TABLE public.company_voice_profiles
      ADD COLUMN IF NOT EXISTS source_document_url text DEFAULT NULL;
    ALTER TABLE public.company_voice_profiles
      ADD COLUMN IF NOT EXISTS source_document_name text DEFAULT NULL;
    ALTER TABLE public.company_voice_profiles
      ADD COLUMN IF NOT EXISTS ai_voice_detected boolean DEFAULT false;
  END IF;
END $$;

-- ┌──────────────────────────────────────────────┐
-- │ 021: Structured Voice Profile                │
-- └──────────────────────────────────────────────┘

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'company_voice_profiles') THEN
    ALTER TABLE public.company_voice_profiles
      ADD COLUMN IF NOT EXISTS structured_voice jsonb DEFAULT NULL;
  END IF;
END $$;

-- ┌──────────────────────────────────────────────┐
-- │ 022: Stripe Billing Integration              │
-- └──────────────────────────────────────────────┘

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS stripe_customer_id text,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id text,
  ADD COLUMN IF NOT EXISTS plan_status text DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS plan_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS has_creative_ai_addon boolean DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_companies_stripe_customer
  ON public.companies (stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_companies_stripe_customer_unique
  ON public.companies (stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;

-- ============================================================
-- Verify: List new columns added
-- ============================================================
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'companies'
  AND column_name IN (
    'trial_started_at', 'trial_expires_at', 'trial_plan',
    'preferred_image_styles', 'tagline', 'description',
    'stripe_customer_id', 'stripe_subscription_id',
    'plan_status', 'plan_updated_at', 'has_creative_ai_addon'
  )
ORDER BY column_name;
