-- ============================================================
-- Week Board: run-state tracking + single-flight job guard
-- Migration 031
--
-- Adds a run-state axis to `weeks` that is deliberately separate
-- from the existing `status` column (editorial review status,
-- untouched by this migration), a lease/heartbeat/retry axis to
-- `content_generation_jobs`, the new 'weekly_production' job
-- type, and a partial unique index that makes a second concurrent
-- run for the same week fail at the database level instead of
-- relying on application logic.
--
-- Purely additive except for widening the job_type check
-- constraint on content_generation_jobs.
--
-- Numbered 031 to avoid the two existing numbering collisions in
-- this repo. 024 has two files in supabase/migrations/. 027 has
-- one file in supabase/migrations/ (now moved to
-- supabase/_misfiled/, never run) and one in supabase/ root
-- (already run). 028, 029, 030 are also already run from
-- supabase/ root, so 031 is the first genuinely free number.
-- ============================================================

-- ============================================================
-- 1. weeks: run-state axis
-- ============================================================
alter table public.weeks
  add column run_state text not null default 'idle'
    check (run_state in ('idle', 'queued', 'running', 'failed', 'complete')),
  add column current_job_id uuid references public.content_generation_jobs(id),
  add column current_phase text,
  add column last_error text,
  add column last_run_at timestamptz;

create index idx_weeks_run_state on public.weeks(run_state)
  where run_state in ('queued', 'running');

-- ============================================================
-- 2. content_generation_jobs: lease/heartbeat, retry, run
--    identity, updated_at
-- ============================================================
alter table public.content_generation_jobs
  add column heartbeat_at timestamptz,
  add column lease_expires_at timestamptz,
  add column worker_id text,
  add column updated_at timestamptz default now(),
  add column attempt integer default 1,
  add column max_attempts integer default 3,
  add column run_id uuid,
  add column priority integer default 0;

create trigger content_generation_jobs_updated_at before update on public.content_generation_jobs
  for each row execute function update_updated_at();

-- ============================================================
-- 3. Widen job_type to permit 'weekly_production', the Week
--    Board's own job type. Every existing type is untouched.
-- ============================================================
alter table public.content_generation_jobs
  drop constraint content_generation_jobs_job_type_check;
alter table public.content_generation_jobs
  add constraint content_generation_jobs_job_type_check
  check (job_type in (
    'content_generation',
    'image_generation',
    'video_rendering',
    'transcription',
    'pdf_generation',
    'platform_adaptation',
    'weekly_production'
  ));

-- ============================================================
-- 4. Single-flight guard. A second Run/Resume/Fresh click while
--    one job is already queued or running for the same week
--    fails the insert at the database level. This is the core of
--    Phase 2: the daemon and the portal both trust this index
--    instead of coordinating in application code.
-- ============================================================
create unique index content_generation_jobs_week_active_uniq
  on public.content_generation_jobs (week_id, job_type)
  where status in ('queued', 'running');
