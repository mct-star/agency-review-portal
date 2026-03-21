-- ============================================================
-- Migration 015: Plan tiers & post type label updates
-- 1. Add plan column to companies for tier-based feature gating
-- 2. Update post_type labels to generic multi-company names
-- ============================================================

-- ============================================================
-- 1. Company plan tiers
-- free  = single piece, free-text subject, 1 spokesperson
-- pro   = week/month generation, topic bank, multiple spokespersons
-- agency = full content strategy, translation, regulatory, multiple spokespersons
-- ============================================================

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS plan text NOT NULL DEFAULT 'free'
  CHECK (plan IN ('free', 'pro', 'agency'));

COMMENT ON COLUMN public.companies.plan IS 'Subscription tier: free, pro, or agency';

-- ============================================================
-- 2. Update post_type labels to platform-generic names
-- Old names were AGENCY Bristol-specific; new names work
-- for any company on the platform.
-- ============================================================

UPDATE public.post_types SET label = 'Problem Diagnosis'    WHERE slug = 'problem_post';
UPDATE public.post_types SET label = 'Experience Story'     WHERE slug = 'launch_story';
UPDATE public.post_types SET label = 'Expert Perspective'   WHERE slug = 'if_i_was';
UPDATE public.post_types SET label = 'Contrarian Take'      WHERE slug = 'contrarian';
UPDATE public.post_types SET label = 'Tactical How-To'      WHERE slug = 'tactical';
UPDATE public.post_types SET label = 'Personal Reflection'  WHERE slug = 'founder_friday';
UPDATE public.post_types SET label = 'Weekend Local'        WHERE slug = 'weekend_personal';
UPDATE public.post_types SET label = 'Article Teaser'       WHERE slug = 'blog_teaser';
UPDATE public.post_types SET label = 'Blog CTA'             WHERE slug = 'blog_cta';
UPDATE public.post_types SET label = 'Triage CTA'           WHERE slug = 'triage_cta';
UPDATE public.post_types SET label = 'Industry News'        WHERE slug = 'industry_news';
UPDATE public.post_types SET label = 'Blog Article'         WHERE slug = 'blog_article';
UPDATE public.post_types SET label = 'LinkedIn Article'     WHERE slug = 'linkedin_article';
