-- Migration 013: Ecosystem tracking + CTA hierarchy
-- Adds week_ecosystems table, CTA tier columns, ecosystem role on content_pieces,
-- and blog_base_url on companies.

-- ============================================================
-- 1. CTA hierarchy columns on company_cta_urls
-- ============================================================

ALTER TABLE public.company_cta_urls
  ADD COLUMN IF NOT EXISTS cta_tier text NOT NULL DEFAULT 'secondary'
    CHECK (cta_tier IN ('primary', 'secondary', 'tertiary')),
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

-- ============================================================
-- 2. week_ecosystems table
-- ============================================================

CREATE TABLE IF NOT EXISTS public.week_ecosystems (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  week_id uuid NOT NULL REFERENCES public.weeks(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  subject text,
  blog_title text,
  blog_url text,
  article_title text,
  article_url text,
  pdf_guide_title text,
  pdf_guide_url text,
  cta_assignments jsonb DEFAULT '{}',
  generation_status text DEFAULT 'pending'
    CHECK (generation_status IN ('pending', 'generating', 'completed', 'partial', 'failed')),
  pieces_total integer DEFAULT 0,
  pieces_completed integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(week_id)
);

-- ============================================================
-- 3. New columns on content_pieces
-- ============================================================

ALTER TABLE public.content_pieces
  ADD COLUMN IF NOT EXISTS ecosystem_role text,
  ADD COLUMN IF NOT EXISTS cta_tier_used text;

-- ============================================================
-- 4. New column on companies
-- ============================================================

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS blog_base_url text;

-- ============================================================
-- 5. RLS on week_ecosystems
-- ============================================================

ALTER TABLE public.week_ecosystems ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can select week_ecosystems"
  ON public.week_ecosystems FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert week_ecosystems"
  ON public.week_ecosystems FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update week_ecosystems"
  ON public.week_ecosystems FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete week_ecosystems"
  ON public.week_ecosystems FOR DELETE
  TO authenticated
  USING (true);
