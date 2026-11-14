-- Capture grants and the newsletter "Mark as published" guard (14 Nov 2026).
--
-- 1. capture_grants: the stored side of a phone capture link. The signed link
--    carries only the grant id; this row says whose it is, for which piece,
--    until when, how many videos it has taken and whether it was withdrawn.
--    A link lives 48 hours and takes at most 3 videos (max_uses). The code
--    counts a use with a compare-and-swap on use_count, so two uploads racing
--    for the last place cannot both win. Written and read only by the service
--    role, and only after the route has checked the signature, the company and
--    the piece. While this table does not exist the code refuses every capture
--    link (fail closed); the photo staff link is unaffected.
--
-- 2. publishing_jobs: one published "linkedin_newsletter" job per piece. The
--    route used to check and then insert, so a double click could record the
--    same article as published twice. The partial unique index makes the
--    second insert fail with error 23505, which the route turns into a 409.
--    Columns used (from migration 002): content_piece_id, target_platform,
--    status ('published' is allowed), published_at, created_at, error_message.
--
--    Duplicates could already exist, because nothing guarded the old route. A
--    unique index cannot be built over them, so the statement below first
--    sets aside every published newsletter job for a piece except the
--    earliest (by published_at, then created_at, then id): it becomes
--    'cancelled' (an allowed status) with a note in error_message. No row is
--    deleted. If there are no duplicates it changes nothing, and it is safe to
--    re-run. Check before applying with:
--      SELECT content_piece_id, count(*) FROM public.publishing_jobs
--      WHERE target_platform = 'linkedin_newsletter' AND status = 'published'
--      GROUP BY 1 HAVING count(*) > 1;

CREATE TABLE IF NOT EXISTS public.capture_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  content_piece_id uuid NOT NULL REFERENCES public.content_pieces(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  use_count integer NOT NULL DEFAULT 0 CHECK (use_count >= 0),
  max_uses integer NOT NULL DEFAULT 3 CHECK (max_uses > 0),
  revoked boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.capture_grants ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.capture_grants FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.capture_grants TO service_role;

CREATE INDEX IF NOT EXISTS capture_grants_piece_idx
  ON public.capture_grants (company_id, content_piece_id);

-- Set aside duplicate published newsletter jobs (keeps the earliest).
WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY content_piece_id
           ORDER BY published_at NULLS LAST, created_at NULLS LAST, id
         ) AS rn
  FROM public.publishing_jobs
  WHERE target_platform = 'linkedin_newsletter'
    AND status = 'published'
    AND content_piece_id IS NOT NULL
)
UPDATE public.publishing_jobs AS j
SET status = 'cancelled',
    error_message = trim(both ' ' FROM coalesce(j.error_message, '') ||
      ' Duplicate "Mark as published" record set aside on 14 Nov 2026 when the unique guard was added. The earliest record is kept.')
FROM ranked AS r
WHERE j.id = r.id AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS publishing_jobs_newsletter_published_uniq
  ON public.publishing_jobs (content_piece_id)
  WHERE target_platform = 'linkedin_newsletter' AND status = 'published';
