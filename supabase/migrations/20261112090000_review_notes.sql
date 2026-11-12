-- Dictated review notes (12 Nov 2026).
--
-- While reading a piece on /content/[pieceId], a reviewer presses the
-- dictate bar and speaks. Each note is stored here against the paragraph
-- that was in view when they pressed it: its position in the rendered
-- body (paragraph_index, 0-based over paragraphs, headings, list items and
-- quotes) and its opening words (paragraph_quote), so the note still
-- reads sensibly if the text is later edited.
--
-- Written and read only by the service role, through
-- /api/content/[pieceId]/notes, which checks the caller's company first.
CREATE TABLE IF NOT EXISTS public.review_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  content_piece_id uuid NOT NULL REFERENCES public.content_pieces(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  paragraph_index integer CHECK (paragraph_index IS NULL OR paragraph_index >= 0),
  paragraph_quote text,
  body text NOT NULL CHECK (length(btrim(body)) > 0 AND length(body) <= 5000),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.review_notes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.review_notes FROM anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.review_notes TO service_role;

CREATE INDEX IF NOT EXISTS review_notes_piece_idx
  ON public.review_notes (content_piece_id, created_at);
CREATE INDEX IF NOT EXISTS review_notes_company_idx
  ON public.review_notes (company_id);
