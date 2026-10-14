-- ============================================================
-- Media library at scale
-- Migration 039
--
-- Adds what the library needs once a company user (not an admin)
-- uploads hundreds of phone photos:
--   * status: a photo sent in through the staff upload link is
--     'pending' and invisible to posts until a company user
--     approves it
--   * thumbnails and video poster frames, so the grid never loads
--     an original
--   * people_present and auto-tag bookkeeping
--   * the staff upload link (per-company token) and its rate limit
--   * company_media_bytes(), the storage used by a company
--
-- Additive only. Run in the Supabase SQL editor.
-- ============================================================

alter table public.photo_inventory
  add column if not exists status text not null default 'approved',
  add column if not exists thumb_path text,
  add column if not exists poster_path text,
  add column if not exists people_present boolean,
  add column if not exists auto_tagged_at timestamptz,
  add column if not exists auto_tag_error text,
  add column if not exists submitted_by text,
  add column if not exists reviewed_by uuid references public.users(id),
  add column if not exists reviewed_at timestamptz;

alter table public.photo_inventory drop constraint if exists photo_inventory_status_check;
alter table public.photo_inventory
  add constraint photo_inventory_status_check check (status in ('approved', 'pending'));

alter table public.photo_inventory drop constraint if exists photo_inventory_source_check;
alter table public.photo_inventory
  add constraint photo_inventory_source_check
  check (source in ('photo_pack', 'weekly_capture', 'shoot', 'bank_upload', 'staff_link'));

comment on column public.photo_inventory.status is
  'approved = usable on posts. pending = sent in through the staff upload link and waiting for a company user. Rejecting a pending photo deletes it.';
comment on column public.photo_inventory.thumb_path is
  'Key in the captures bucket of the 400 px thumbnail (photos). The library grid serves this, never the original.';
comment on column public.photo_inventory.poster_path is
  'Key in the captures bucket of the poster frame (videos).';
comment on column public.photo_inventory.people_present is
  'True when the auto-tagger saw a person. Null means not assessed. Automated posts avoid photos where this is true.';

create index if not exists photo_inventory_company_status_idx
  on public.photo_inventory (company_id, status, added_at desc);
create index if not exists photo_inventory_untagged_idx
  on public.photo_inventory (company_id) where auto_tagged_at is null and kind = 'photo';

-- Storage used by a company: the size of every original it holds.
-- Thumbnails are small and are not counted.
create or replace function public.company_media_bytes(p_company uuid)
returns bigint
language sql
stable
as $$
  select coalesce(sum(size_bytes), 0)::bigint
  from public.photo_inventory
  where company_id = p_company;
$$;

-- ------------------------------------------------------------
-- Staff upload link
-- ------------------------------------------------------------
alter table public.companies
  add column if not exists staff_upload_token text unique,
  add column if not exists staff_upload_enabled boolean not null default false,
  add column if not exists staff_upload_notified_at timestamptz;

comment on column public.companies.staff_upload_token is
  'Bearer token in the staff upload address (/add-photo/<token>). Anyone holding it can add photos to the pending queue. Rotate it from company settings.';

-- Rate limit ledger for the unauthenticated staff upload endpoints.
-- Written and read by the service role only: RLS on, no policies.
create table if not exists public.staff_upload_attempts (
  id bigint generated always as identity primary key,
  company_id uuid not null references public.companies(id) on delete cascade,
  ip_hash text not null,
  created_at timestamptz not null default now()
);
alter table public.staff_upload_attempts enable row level security;
create index if not exists staff_upload_attempts_company_time_idx
  on public.staff_upload_attempts (company_id, created_at desc);
create index if not exists staff_upload_attempts_ip_time_idx
  on public.staff_upload_attempts (company_id, ip_hash, created_at desc);

-- Notifications: the new kinds.
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications
  add constraint notifications_type_check
  check (type in ('content_ready', 'piece_approved', 'changes_requested', 'comment_added', 'staff_photo_pending', 'draft_ready'));
