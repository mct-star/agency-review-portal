-- Keep all existing company networks and allow the approved YouTube/Pinterest rollout.
DO $migration$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.companies'::regclass
      AND conname = 'companies_social_networks_check'
      AND pg_get_constraintdef(oid) LIKE '%youtube%'
      AND pg_get_constraintdef(oid) LIKE '%pinterest%'
  ) THEN
    ALTER TABLE public.companies DROP CONSTRAINT IF EXISTS companies_social_networks_check;
    ALTER TABLE public.companies ADD CONSTRAINT companies_social_networks_check
      CHECK (social_networks <@ ARRAY[
        'linkedin', 'facebook', 'instagram', 'threads', 'bluesky', 'x', 'tiktok', 'gbp',
        'youtube', 'pinterest'
      ]::text[]);
  END IF;
END;
$migration$;
