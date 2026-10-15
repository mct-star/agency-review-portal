-- 024: Trial email tracking columns
-- Tracks whether warning and expired emails have been sent
-- to prevent duplicate sends from the daily cron job.

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'companies' AND column_name = 'trial_warning_sent'
  ) THEN
    ALTER TABLE public.companies ADD COLUMN trial_warning_sent timestamptz;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'companies' AND column_name = 'trial_expired_sent'
  ) THEN
    ALTER TABLE public.companies ADD COLUMN trial_expired_sent timestamptz;
  END IF;
END $$;
