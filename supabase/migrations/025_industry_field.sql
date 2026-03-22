-- 025: Add industry field to companies
-- Used for dynamic content context, scene quote backgrounds, and compliance framework selection

ALTER TABLE public.companies
ADD COLUMN IF NOT EXISTS industry text;

COMMENT ON COLUMN public.companies.industry IS 'Company industry/sector (e.g. healthcare, fintech, construction). Shapes content context and compliance frameworks.';
