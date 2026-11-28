-- LinkedIn move, step 3: a maintained name-to-URN list for real mentions.
-- Approved text is never changed; the publisher converts a listed name to
-- LinkedIn mention markup only at publish time. Safe to re-run.

CREATE TABLE IF NOT EXISTS linkedin_mentions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  urn text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('person', 'organization')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT linkedin_mentions_urn_matches_kind CHECK (
    (kind = 'person' AND urn ~ '^urn:li:person:[A-Za-z0-9_-]+$')
    OR (kind = 'organization' AND urn ~ '^urn:li:organization:[0-9]+$')
  )
);

-- One entry per name per company, ignoring case.
CREATE UNIQUE INDEX IF NOT EXISTS linkedin_mentions_company_name_idx
  ON linkedin_mentions (company_id, lower(name));

-- Every route uses the service role and filters on company_id; no client policy is granted.
ALTER TABLE linkedin_mentions ENABLE ROW LEVEL SECURITY;

-- Approval covers an uploaded PDF: the approval records which PDF was approved
-- (sha256 of its address). Null for every other piece, so existing approvals stay valid.
ALTER TABLE content_approvals ADD COLUMN IF NOT EXISTS media_hash text;
