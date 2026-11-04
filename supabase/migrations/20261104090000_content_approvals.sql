-- Recorded approvals (Phase 2 of the content process plan, 4 Nov 2026).
--
-- content_pieces.approval_status says where a piece stands now; it does not
-- say who decided, when, or on which text. Phase B2 on the Mac (blog push to
-- agency-website, PDF guide) refuses to publish a piece unless its newest
-- row here is an approval whose version_hash equals the piece's current
-- version. Rows are append-only: a new decision is a new row.
--
-- version_hash: sha256 hex of title || NUL || markdown_body || NUL ||
-- coalesce(first_comment, ''), UTF-8. Defined in
-- src/lib/content/version-hash.ts and, on the Mac, content_approval_gate.py.
CREATE TABLE IF NOT EXISTS public.content_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  piece_id uuid NOT NULL REFERENCES public.content_pieces(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  version_hash text NOT NULL CHECK (version_hash ~ '^[0-9a-f]{64}$'),
  decision text NOT NULL CHECK (decision IN ('approved', 'changes_requested')),
  decided_by text NOT NULL,
  decided_via text NOT NULL CHECK (decided_via IN ('review', 'bulk_review', 'ops_bridge')),
  decided_at timestamptz NOT NULL DEFAULT now(),
  note text
);

ALTER TABLE public.content_approvals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.content_approvals FROM anon, authenticated;
GRANT SELECT, INSERT ON public.content_approvals TO service_role;

CREATE INDEX IF NOT EXISTS content_approvals_piece_idx
  ON public.content_approvals (piece_id, decided_at DESC);
CREATE INDEX IF NOT EXISTS content_approvals_company_idx
  ON public.content_approvals (company_id, decided_at DESC);

-- Append-only: a recorded decision is never rewritten. Deleting a piece
-- still removes its rows through the cascade.
CREATE OR REPLACE FUNCTION public.content_approvals_no_update()
RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  RAISE EXCEPTION 'content_approvals rows are append-only; record a new decision instead';
END;
$fn$;

DROP TRIGGER IF EXISTS content_approvals_no_update ON public.content_approvals;
CREATE TRIGGER content_approvals_no_update
  BEFORE UPDATE ON public.content_approvals
  FOR EACH ROW EXECUTE FUNCTION public.content_approvals_no_update();
