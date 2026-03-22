-- 024: Add brand_palette column for multiple brand colours
-- Each company can define 3-6 brand colours used across quote cards, carousels, etc.
-- Format: ["#7C3AED", "#0EA5E9", "#DC2626", "#059669"]

ALTER TABLE public.companies
ADD COLUMN IF NOT EXISTS brand_palette jsonb DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.companies.brand_palette IS 'Array of hex colour strings for brand palette. Used for quote cards, carousel accents, etc.';
