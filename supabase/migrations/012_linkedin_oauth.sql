-- LinkedIn OAuth connection per user
-- Stores the access token and metadata needed to post on the user's behalf

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'linkedin_connections'
  ) THEN
    CREATE TABLE public.linkedin_connections (
      id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id             uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
      access_token        text NOT NULL,
      expires_at          timestamptz NOT NULL,
      linkedin_person_id  text NOT NULL,
      linkedin_name       text,
      created_at          timestamptz DEFAULT now(),
      updated_at          timestamptz DEFAULT now(),
      UNIQUE(user_id)
    );

    ALTER TABLE public.linkedin_connections ENABLE ROW LEVEL SECURITY;

    -- Users can only read/write their own connection
    CREATE POLICY "Users manage own linkedin connection"
      ON public.linkedin_connections
      FOR ALL
      USING (user_id = auth.uid())
      WITH CHECK (user_id = auth.uid());
  END IF;
END $$;
