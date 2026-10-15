-- ============================================================
-- Coming up: a venue's list of dated events and launches
-- Migration 046
--
-- A hospitality venue keeps one list of what is coming up: events
-- (a quiz night, live music, Christmas bookings opening) and
-- launches (a new dish, a new menu, an offer). Items arrive from the
-- weekly dictation, from an upload (a PDF, a photo of a chalkboard,
-- an .ics calendar) or from the quick add form.
--
-- The 07:00 job (/api/cron/weather-posts) reads this list first:
-- when an item has a build-up, reveal or still-on post due that day,
-- it drafts that post instead of the weather post. Still one
-- automatic post a day, still pending until a person approves it.
--
-- Additive and safe to re-run. Apply after 045.
-- ============================================================

create table if not exists public.venue_calendar_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  kind text not null check (kind in ('event', 'launch')),
  title text not null,
  details text,
  starts_on date not null,
  ends_on date,
  start_time text,
  build_up jsonb not null default '{"week":true,"two_days":true,"day_of":true}'::jsonb,
  status text not null default 'active' check (status in ('active', 'cancelled')),
  source text not null check (source in ('dictation', 'upload', 'manual')),
  created_by uuid,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

comment on table public.venue_calendar_items is
  'A venue''s Coming up list. Events get build-up posts (seven days, two days, on the day); launches get a reveal and, for a run of four days or more, one still-on post.';

create index if not exists venue_calendar_items_company_starts_idx
  on public.venue_calendar_items (company_id, starts_on);

alter table public.venue_calendar_items enable row level security;

drop policy if exists "Client reads own coming up" on public.venue_calendar_items;
create policy "Client reads own coming up" on public.venue_calendar_items
  for select using (company_id = public.get_user_company_id());

drop policy if exists "Admin reads coming up" on public.venue_calendar_items;
create policy "Admin reads coming up" on public.venue_calendar_items
  for select using (public.get_user_role() = 'admin');
-- Writes are made by the API routes and the job with the service role, which bypasses RLS.

drop trigger if exists venue_calendar_items_updated_at on public.venue_calendar_items;
create trigger venue_calendar_items_updated_at before update on public.venue_calendar_items
  for each row execute function update_updated_at();
