-- Migration 007: Story/proof point bank + review document support
-- The story bank stores real-world experiences, case studies, and proof points
-- that get woven into content. Company-specific, not hardcoded to one client.

CREATE TABLE IF NOT EXISTS public.story_bank (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  title text NOT NULL,
  story_text text NOT NULL,
  category text DEFAULT 'general',
  tags text[] DEFAULT '{}',
  pillar text,
  is_used boolean DEFAULT false,
  used_count integer DEFAULT 0,
  last_used_in_week_id uuid REFERENCES public.weeks(id),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_story_bank_company ON public.story_bank(company_id);

ALTER TABLE public.story_bank ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'admin_manage_stories') THEN
    CREATE POLICY admin_manage_stories ON public.story_bank FOR ALL
      USING (auth.jwt() ->> 'role' = 'service_role');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'users_read_stories') THEN
    CREATE POLICY users_read_stories ON public.story_bank FOR SELECT
      USING (true);
  END IF;
END $$;

-- Add story_bank_ref to content_pieces (which story was used)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'content_pieces' AND column_name = 'story_bank_id'
  ) THEN
    ALTER TABLE public.content_pieces ADD COLUMN story_bank_id uuid REFERENCES public.story_bank(id);
  END IF;
END $$;

-- Review documents table (atom 13 compilation)
CREATE TABLE IF NOT EXISTS public.review_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  week_id uuid NOT NULL REFERENCES public.weeks(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  compiled_content text NOT NULL,
  quality_summary jsonb DEFAULT '{}',
  compiled_at timestamptz DEFAULT now()
);

ALTER TABLE public.review_documents ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'admin_manage_review_docs') THEN
    CREATE POLICY admin_manage_review_docs ON public.review_documents FOR ALL
      USING (auth.jwt() ->> 'role' = 'service_role');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'users_read_review_docs') THEN
    CREATE POLICY users_read_review_docs ON public.review_documents FOR SELECT
      USING (true);
  END IF;
END $$;
