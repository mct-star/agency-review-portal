-- ============================================================
-- Daily weather post
-- Migration 044 (applied live as 041_daily_weather_post; renumbered)
--
-- Per-company settings for the daily weather post, and a ledger
-- of what the job has done so it never drafts the same day twice.
--
-- The job (/api/cron/weather-posts) reads the forecast for the
-- company's position, writes a draft and puts it in front of a
-- company user. A draft is always 'pending': nothing publishes
-- without approval.
--
-- No default position is set. A company that has not been given a
-- postcode or position is skipped and reported, never guessed at.
--
-- Additive only. Run in the Supabase SQL editor after 042 and 043.
-- ============================================================

alter table public.companies
  add column if not exists postcode text,
  add column if not exists latitude double precision,
  add column if not exists longitude double precision,
  add column if not exists timezone text not null default 'Europe/London',
  add column if not exists weather_post_enabled boolean not null default false,
  add column if not exists weather_post_time time not null default '07:00',
  add column if not exists weather_post_for text not null default 'today';

alter table public.companies drop constraint if exists companies_weather_post_for_check;
alter table public.companies
  add constraint companies_weather_post_for_check check (weather_post_for in ('today', 'tomorrow'));

alter table public.companies drop constraint if exists companies_latitude_check;
alter table public.companies add constraint companies_latitude_check check (latitude is null or latitude between -90 and 90);
alter table public.companies drop constraint if exists companies_longitude_check;
alter table public.companies add constraint companies_longitude_check check (longitude is null or longitude between -180 and 180);

comment on column public.companies.weather_post_for is
  'today = draft the forecast for the company''s own date; tomorrow = draft tomorrow''s a day ahead, so it can be approved and exported before it is due.';
comment on column public.companies.weather_post_time is
  'The time of day, in the company''s time zone, the weather post is scheduled for.';

create table if not exists public.weather_post_runs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  target_date date not null,
  status text not null check (status in ('drafted', 'failed')),
  content_piece_id uuid references public.content_pieces(id) on delete set null,
  forecast jsonb,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, target_date)
);

alter table public.weather_post_runs enable row level security;

create policy "Admin reads weather runs" on public.weather_post_runs
  for select using (public.get_user_role() = 'admin');
create policy "Client reads own weather runs" on public.weather_post_runs
  for select using (company_id = public.get_user_company_id());
-- Writes are made by the job with the service role, which bypasses RLS.

create index if not exists weather_post_runs_company_date_idx
  on public.weather_post_runs (company_id, target_date desc);

create trigger weather_post_runs_updated_at before update on public.weather_post_runs
  for each row execute function update_updated_at();
