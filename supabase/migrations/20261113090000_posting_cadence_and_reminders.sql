-- Posting cadence and review reminders (13 Nov 2026). Data layer only.
--
-- company_cadence: how often a company reviews and approves content.
--   weekly_batch  one batch a week: a "week ready" reminder, then the
--                 deploy reminder once approved.
--   daily         a reminder for each day's post.
--   posting_days  a reminder only on days that have an active
--                 posting_slots row.
-- It deliberately holds NO timezone and NO schedule of its own:
--   - the timezone is companies.timezone (migration 044);
--   - the posting days and times are posting_slots (migration 004).
-- reminder_hour is the local hour (0 to 23, in companies.timezone) at
-- which that day's reminders go out. reminder_recipients are email
-- addresses, stored lower case; an empty list means "no reminders".
--
-- reminder_log: one row per reminder actually sent. The unique index makes
-- a second send of the same reminder impossible: same company, recipient,
-- kind, subject and follow-up flag. A follow-up (the nudge after an
-- unanswered reminder) is its own row with is_follow_up = true, so each
-- reminder can be sent once and followed up once.
--   subject_key  the thing the reminder is about, always set so the
--                unique index works (NULLs never collide in Postgres):
--                the content piece id for today's post and manual publish,
--                the week id for week ready and deploy week, the local
--                date (YYYY-MM-DD) for capture due.
--   piece_id / week_id  the same subject as a real link where there is
--                one, set null if the piece or week is later deleted;
--                the log row and its subject_key stay.
--
-- Written and read only by the service role (the reminder job and the
-- settings route, which check the caller's company first).
CREATE TABLE IF NOT EXISTS public.company_cadence (
  company_id uuid PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  mode text NOT NULL DEFAULT 'weekly_batch'
    CHECK (mode IN ('weekly_batch', 'daily', 'posting_days')),
  reminder_hour integer NOT NULL DEFAULT 8
    CHECK (reminder_hour BETWEEN 0 AND 23),
  reminder_recipients text[] NOT NULL DEFAULT '{}'
    CHECK (array_to_string(reminder_recipients, ',') = lower(array_to_string(reminder_recipients, ','))),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.company_cadence ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.company_cadence FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.company_cadence TO service_role;

DROP TRIGGER IF EXISTS company_cadence_updated_at ON public.company_cadence;
CREATE TRIGGER company_cadence_updated_at
  BEFORE UPDATE ON public.company_cadence
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TABLE IF NOT EXISTS public.reminder_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  recipient text NOT NULL CHECK (recipient = lower(btrim(recipient)) AND recipient <> ''),
  kind text NOT NULL
    CHECK (kind IN ('week_ready', 'deploy_week', 'todays_post', 'manual_publish', 'capture_due')),
  subject_key text NOT NULL CHECK (length(btrim(subject_key)) > 0),
  piece_id uuid REFERENCES public.content_pieces(id) ON DELETE SET NULL,
  week_id uuid REFERENCES public.weeks(id) ON DELETE SET NULL,
  is_follow_up boolean NOT NULL DEFAULT false,
  sent_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.reminder_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.reminder_log FROM anon, authenticated;
GRANT SELECT, INSERT ON public.reminder_log TO service_role;

-- The rule: a reminder can be recorded once. Insert first, send only if the
-- insert succeeded (ON CONFLICT DO NOTHING returns no row on a repeat).
CREATE UNIQUE INDEX IF NOT EXISTS reminder_log_once_idx
  ON public.reminder_log (company_id, recipient, kind, subject_key, is_follow_up);
CREATE INDEX IF NOT EXISTS reminder_log_company_sent_idx
  ON public.reminder_log (company_id, sent_at DESC);
