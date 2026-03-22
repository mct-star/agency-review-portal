-- 026: Add provider_routing column for per-company image provider overrides
-- Format: { "pixar_3d": "fal_flux", "editorial_photo": "gemini_imagen" }
-- "auto" = use smart routing (default)

ALTER TABLE public.companies
ADD COLUMN IF NOT EXISTS provider_routing jsonb DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.companies.provider_routing IS 'Per-visual-style provider overrides. Keys are style slugs, values are provider keys. Empty = auto routing.';
