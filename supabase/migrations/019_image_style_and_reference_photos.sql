-- Image style preferences and reference photos for spokesperson likeness

-- Company-level preferred image styles (array of archetype slugs the user has chosen)
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS preferred_image_styles jsonb DEFAULT NULL;

-- Spokesperson appearance description (text prompt for AI image generation)
ALTER TABLE public.company_spokespersons
  ADD COLUMN IF NOT EXISTS appearance_description text DEFAULT NULL;

-- Reference photos for spokesperson likeness (array of URLs)
ALTER TABLE public.company_spokespersons
  ADD COLUMN IF NOT EXISTS reference_photos jsonb DEFAULT '[]'::jsonb;

-- Company asset templates (uploaded brand templates, social templates etc.)
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

CREATE POLICY "Admin manages asset templates" ON public.company_asset_templates
  FOR ALL USING (public.get_user_role() = 'admin');
CREATE POLICY "Client reads own asset templates" ON public.company_asset_templates
  FOR SELECT USING (company_id = public.get_user_company_id());
