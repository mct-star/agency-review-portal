-- Publishing alerts (28 Nov 2026).
--
-- One row per alert sent about a publishing job. The unique key on
-- (job_id, kind) is what makes alerting idempotent: the watcher inserts the
-- row first and only sends when the insert wins, so two overlapping runs never
-- alert twice for the same job and failure.
--
-- kind is one of: failed, comment_failed, late, live_check_missing.
--
-- Written only by the service role (the cron jobs). Row level security is on
-- with no policies, so no signed-in user can read or write it.
--
-- Safe to run twice.

create table if not exists public.publishing_alerts (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.publishing_jobs(id) on delete cascade,
  kind text not null check (kind in ('failed', 'comment_failed', 'late', 'live_check_missing')),
  created_at timestamptz not null default now(),
  unique (job_id, kind)
);

alter table public.publishing_alerts enable row level security;
