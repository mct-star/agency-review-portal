-- Migration 009: Multiple spokespersons per company
-- Each company can have 2-5 people who post content.
-- Each person has their own name, photo, tagline, and voice profile.

CREATE TABLE IF NOT EXISTS public.company_spokespersons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  tagline text,
  profile_picture_url text,
  linkedin_url text,
  voice_profile_id uuid,
  is_primary boolean DEFAULT false,
  is_active boolean DEFAULT true,
  sort_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_company_spokespersons_company ON public.company_spokespersons(company_id);

ALTER TABLE public.company_spokespersons ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'admin_manage_spokespersons') THEN
    CREATE POLICY admin_manage_spokespersons ON public.company_spokespersons FOR ALL
      USING (auth.jwt() ->> 'role' = 'service_role');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'users_read_spokespersons') THEN
    CREATE POLICY users_read_spokespersons ON public.company_spokespersons FOR SELECT
      USING (true);
  END IF;
END $$;

-- Link content pieces to a specific spokesperson
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'content_pieces' AND column_name = 'spokesperson_id'
  ) THEN
    ALTER TABLE public.content_pieces ADD COLUMN spokesperson_id uuid REFERENCES public.company_spokespersons(id);
  END IF;
END $$;

-- Link posting slots to a default spokesperson (optional)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'posting_slots' AND column_name = 'default_spokesperson_id'
  ) THEN
    ALTER TABLE public.posting_slots ADD COLUMN default_spokesperson_id uuid REFERENCES public.company_spokespersons(id);
  END IF;
END $$;

-- Seed AGENCY Bristol spokesperson from existing company data
DO $$
DECLARE v_company_id uuid;
BEGIN
  SELECT id INTO v_company_id FROM public.companies WHERE slug = 'agency-bristol';
  IF v_company_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.company_spokespersons WHERE company_id = v_company_id
  ) THEN
    INSERT INTO public.company_spokespersons (company_id, name, tagline, profile_picture_url, is_primary)
    SELECT v_company_id,
      COALESCE(spokesperson_name, 'Michael Colling-Tuck'),
      COALESCE(spokesperson_tagline, 'Founder, AGENCY Medical Marketing | Healthcare Demand Generation'),
      profile_picture_url,
      true
    FROM public.companies WHERE id = v_company_id;
  END IF;
END $$;

-- Seed Star Linen spokesperson
DO $$
DECLARE v_company_id uuid;
BEGIN
  SELECT id INTO v_company_id FROM public.companies WHERE slug = 'star-linen-uk';
  IF v_company_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.company_spokespersons WHERE company_id = v_company_id
  ) THEN
    INSERT INTO public.company_spokespersons (company_id, name, tagline, is_primary)
    SELECT v_company_id,
      COALESCE(spokesperson_name, 'Stephen Broadhurst'),
      COALESCE(spokesperson_tagline, 'Managing Director, Star Linen UK'),
      true
    FROM public.companies WHERE id = v_company_id;
  END IF;
END $$;
