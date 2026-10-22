-- Durable, encrypted Bluesky OAuth state for callbacks across server instances.
-- Tokens for completed connections stay in company_social_accounts.
CREATE TABLE IF NOT EXISTS public.bluesky_oauth_states (
  state_key text PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  encrypted_value text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.bluesky_oauth_states ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.bluesky_oauth_states FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bluesky_oauth_states TO service_role;
CREATE INDEX IF NOT EXISTS bluesky_oauth_states_expiry_idx ON public.bluesky_oauth_states(expires_at);

-- Preserve every existing destination while allowing a real Pinterest account.
DO $migration$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.company_social_accounts'::regclass
      AND conname = 'company_social_accounts_platform_check'
      AND pg_get_constraintdef(oid) LIKE '%pinterest%'
  ) THEN
    ALTER TABLE public.company_social_accounts DROP CONSTRAINT IF EXISTS company_social_accounts_platform_check;
    ALTER TABLE public.company_social_accounts ADD CONSTRAINT company_social_accounts_platform_check
      CHECK (platform IN (
        'linkedin_personal', 'linkedin_company', 'twitter', 'bluesky', 'threads',
        'facebook', 'instagram', 'tiktok', 'substack', 'medium',
        'youtube', 'youtube_shorts', 'pinterest'
      ));
  END IF;
END;
$migration$;
