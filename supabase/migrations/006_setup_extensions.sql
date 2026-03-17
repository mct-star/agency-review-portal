-- Migration 006: Setup Extensions
-- Adds tables for the Setup section: sign-offs, CTA URLs, voice profiles, content themes, setup progress.
-- Also adds columns for cohesive/variety strategy mode and image generation tracking.
-- Safe to re-run (uses IF NOT EXISTS / DO blocks).

-- ============================================================
-- 1. Company sign-offs (standard ending text + first comment CTA)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.company_signoffs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  label text NOT NULL DEFAULT 'Default',
  signoff_text text NOT NULL,
  first_comment_template text,
  applies_to_post_types text[] DEFAULT '{}',
  is_active boolean DEFAULT true,
  sort_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_company_signoffs_company ON public.company_signoffs(company_id);

-- ============================================================
-- 2. Company CTA URLs (key destination URLs)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.company_cta_urls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  label text NOT NULL,
  url text NOT NULL,
  link_text text,
  sort_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_company_cta_urls_company ON public.company_cta_urls(company_id);

-- ============================================================
-- 3. Company voice profiles
-- ============================================================

CREATE TABLE IF NOT EXISTS public.company_voice_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  source text NOT NULL DEFAULT 'manual',
  voice_description text,
  writing_samples text,
  banned_vocabulary text,
  signature_devices text,
  emotional_register text,
  raw_analysis jsonb DEFAULT '{}',
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_company_voice_profiles_company ON public.company_voice_profiles(company_id);

-- ============================================================
-- 4. Content themes (monthly/quarterly theme calendar)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.content_themes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  theme_name text NOT NULL,
  pillar text,
  quarter integer,
  month integer,
  year integer,
  description text,
  sort_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_content_themes_company ON public.content_themes(company_id);

-- ============================================================
-- 5. Setup progress tracking
-- ============================================================

CREATE TABLE IF NOT EXISTS public.setup_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid UNIQUE NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  step_strategy boolean DEFAULT false,
  step_schedule boolean DEFAULT false,
  step_topics boolean DEFAULT false,
  step_voice boolean DEFAULT false,
  step_signoffs boolean DEFAULT false,
  step_urls boolean DEFAULT false,
  step_api_keys boolean DEFAULT false,
  completed_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ============================================================
-- 6. New columns on existing tables
-- ============================================================

-- content_strategy_mode on companies
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'companies' AND column_name = 'content_strategy_mode'
  ) THEN
    ALTER TABLE public.companies ADD COLUMN content_strategy_mode text DEFAULT 'cohesive';
  END IF;
END $$;

-- image_generation_status on content_pieces
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'content_pieces' AND column_name = 'image_generation_status'
  ) THEN
    ALTER TABLE public.content_pieces ADD COLUMN image_generation_status text DEFAULT 'pending';
  END IF;
END $$;

-- subject on weeks (for cohesive-mode weeks)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'weeks' AND column_name = 'subject'
  ) THEN
    ALTER TABLE public.weeks ADD COLUMN subject text;
  END IF;
END $$;

-- ============================================================
-- 7. RLS policies
-- ============================================================

ALTER TABLE public.company_signoffs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_cta_urls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_voice_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_themes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.setup_progress ENABLE ROW LEVEL SECURITY;

-- Admin can manage all
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'admin_manage_signoffs') THEN
    CREATE POLICY admin_manage_signoffs ON public.company_signoffs FOR ALL
      USING (auth.jwt() ->> 'role' = 'service_role');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'admin_manage_cta_urls') THEN
    CREATE POLICY admin_manage_cta_urls ON public.company_cta_urls FOR ALL
      USING (auth.jwt() ->> 'role' = 'service_role');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'admin_manage_voice_profiles') THEN
    CREATE POLICY admin_manage_voice_profiles ON public.company_voice_profiles FOR ALL
      USING (auth.jwt() ->> 'role' = 'service_role');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'admin_manage_content_themes') THEN
    CREATE POLICY admin_manage_content_themes ON public.content_themes FOR ALL
      USING (auth.jwt() ->> 'role' = 'service_role');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'admin_manage_setup_progress') THEN
    CREATE POLICY admin_manage_setup_progress ON public.setup_progress FOR ALL
      USING (auth.jwt() ->> 'role' = 'service_role');
  END IF;
END $$;

-- Authenticated users can read their company's data
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'users_read_own_signoffs') THEN
    CREATE POLICY users_read_own_signoffs ON public.company_signoffs FOR SELECT
      USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'users_read_own_cta_urls') THEN
    CREATE POLICY users_read_own_cta_urls ON public.company_cta_urls FOR SELECT
      USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'users_read_own_voice_profiles') THEN
    CREATE POLICY users_read_own_voice_profiles ON public.company_voice_profiles FOR SELECT
      USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'users_read_content_themes') THEN
    CREATE POLICY users_read_content_themes ON public.content_themes FOR SELECT
      USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'users_read_setup_progress') THEN
    CREATE POLICY users_read_setup_progress ON public.setup_progress FOR SELECT
      USING (true);
  END IF;
END $$;

-- ============================================================
-- 8. Seed AGENCY Bristol defaults
-- ============================================================

-- Set strategy mode
UPDATE public.companies
SET content_strategy_mode = 'cohesive'
WHERE slug = 'agency-bristol' AND content_strategy_mode IS NULL;

-- Seed default sign-off
INSERT INTO public.company_signoffs (company_id, label, signoff_text, first_comment_template)
SELECT c.id, 'Default',
  E'Enjoy this? ♻️ Repost it to your network and follow Michael Colling-Tuck for more.',
  E'Want to go deeper on this? Download our free guide: {url}'
FROM public.companies c
WHERE c.slug = 'agency-bristol'
ON CONFLICT DO NOTHING;

-- Seed key URLs
DO $$
DECLARE v_company_id uuid;
BEGIN
  SELECT id INTO v_company_id FROM public.companies WHERE slug = 'agency-bristol';
  IF v_company_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.company_cta_urls WHERE company_id = v_company_id) THEN
    INSERT INTO public.company_cta_urls (company_id, label, url, link_text, sort_order) VALUES
      (v_company_id, 'Product Playbook', 'https://www.agencybristol.com/download-product-playbook-framework', 'Download the framework', 0),
      (v_company_id, 'Demand Gen Guide', 'https://www.agencybristol.com/how-to-generate-demand', 'Get the guide', 1),
      (v_company_id, 'Newsletter', 'https://www.agencybristol.com/sign-up', 'Sign up here', 2),
      (v_company_id, 'Blog', 'https://www.agencybristol.com/blog', 'Read on the blog', 3),
      (v_company_id, 'Podcast', 'https://www.agencybristol.com/podcast', 'Listen now', 4);
  END IF;
END $$;

-- Create setup progress row
INSERT INTO public.setup_progress (company_id, step_strategy, step_schedule, step_topics, step_voice, step_signoffs, step_urls, step_api_keys)
SELECT c.id, true, false, true, false, true, true, true
FROM public.companies c
WHERE c.slug = 'agency-bristol'
ON CONFLICT (company_id) DO NOTHING;
