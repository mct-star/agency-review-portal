-- Migration 014: Link social accounts to individual spokespersons
-- Adds spokesperson_id FK so personal social accounts can belong to a specific person
-- while company-level accounts (linkedin_company, facebook page) remain unlinked.

-- ============================================================
-- 1. Add spokesperson_id to company_social_accounts
-- ============================================================

ALTER TABLE public.company_social_accounts
  ADD COLUMN IF NOT EXISTS spokesperson_id uuid REFERENCES public.company_spokespersons(id) ON DELETE SET NULL;

-- ============================================================
-- 2. Add spokesperson_id to company_voice_profiles for direct lookup
-- ============================================================

ALTER TABLE public.company_voice_profiles
  ADD COLUMN IF NOT EXISTS spokesperson_id uuid REFERENCES public.company_spokespersons(id) ON DELETE SET NULL;
