-- ============================================================
-- Content system: the calendar as data
-- Migration 032
--
-- Weekly planning had no calendar after Q2 stopped at week 26,
-- so it fell back to scanning a Downloads folder and generating
-- topics from file movements. Three weeks of weak copy followed.
-- The fix is not a better prompt, it is a source contract that
-- exists as rows: every slot names WHERE its substance comes
-- from, not just what it is about.
--
-- This migration makes that contract enforceable rather than
-- advisory. A slot cannot exist without a named source owner
-- (not null), and it cannot exist without an anchor unless it is
-- a reactive slot deliberately held open for a live signal
-- (check constraint, not application logic). The database
-- refuses the shape that caused the problem.
--
-- Additive only. Nothing in 031 is touched.
--
-- Numbering: this repo has collisions at 024 (two files) and 027
-- (one file in supabase/migrations/ never run, one in supabase/
-- root already run). 028, 029, 030 ran from supabase/ root. 031
-- was the first free number and 032 is the next.
-- ============================================================

-- ============================================================
-- 1. weeks: photo tier and quarterly arc
--
-- Photo supply, not editorial ambition, sets how many posts a
-- week can ship (tier A = 3+ new photos = 6 posts, B = 1 to 2 =
-- 4 posts, C = zero = 3 posts). The tier is decided BEFORE any
-- topic is considered, so it lives on the week, not on the slot.
-- tier_set_at exists to make "two consecutive tier C weeks"
-- detectable, which is the documented escalation trigger.
-- ============================================================
alter table public.weeks
  add column photo_tier text check (photo_tier in ('a', 'b', 'c')),
  add column tier_set_at timestamptz,
  add column arc_movement text,
  add column seasonality_note text;

comment on column public.weeks.photo_tier is
  'Photo supply tier set at planning time. a = 3+ new photos, b = 1 to 2, c = zero. Determines post volume for the week. Null until planning runs.';
comment on column public.weeks.arc_movement is
  'Which movement of the quarterly narrative arc this week sits in, for example "October, The Budget Case". Free text because the arc is redefined each quarter.';
comment on column public.weeks.seasonality_note is
  'Holidays, half terms, conference dates and attention windows that cap or lift the week. Carried from the calendar so planners do not rediscover it.';

-- ============================================================
-- 2. calendar_slots
--
-- One row per slot per week. This is the source contract.
--
-- week_id is nullable and week_number/year/week_start_date are
-- carried on the row deliberately: the Q3 bridge and Q4
-- calendars were seeded before their weeks rows exist, and a
-- calendar that cannot be loaded ahead of the week it describes
-- is the same failure this migration corrects.
--
-- week_number here is the ISO week derived from the slot's real
-- date, NOT the number printed in the calendar markdown. The two
-- calendar files number their weeks one lower than ISO (their
-- "Week 36" begins Monday 7 September 2026, which is ISO week
-- 37). weeks.week_number in this schema is ISO, so storing the
-- file's number would silently join a week card to the wrong
-- week. source_week_label preserves the file's own numbering so
-- the discrepancy stays visible instead of being erased.
-- ============================================================
create table public.calendar_slots (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  week_id uuid references public.weeks(id) on delete set null,

  week_number integer not null,
  year integer not null,
  week_start_date date not null,
  source_week_label text,

  slot_date date not null,
  day_of_week text not null check (day_of_week in (
    'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'
  )),

  -- slot_type is the production class, because production cost
  -- and not topic is what determines how many slots a week can
  -- carry. slot_role keeps the calendar's own wording, which
  -- varies ("Argument", "Argument, softened") and so cannot be
  -- part of a stable key.
  slot_type text not null check (slot_type in ('thesis', 'doc', 'carousel', 'reactive')),
  slot_role text,
  post_type_slug text,

  topic text not null,
  pillar text not null,
  theme text,
  six_source_tags text[],

  source_owner text not null check (source_owner in (
    'booksy', 'stratty_canon', 'amy', 'ppcy', 'voice_note', 'industry_radar'
  )),
  source_alternates text[],
  source_anchor text,
  anchor_pending boolean not null default false,

  image_direction text,
  photo_needed boolean not null default false,

  elu text,
  elu_e smallint check (elu_e between 0 and 3),
  elu_l smallint check (elu_l between 0 and 3),
  elu_u smallint check (elu_u between 0 and 3),

  cta_tier text check (cta_tier in ('hot', 'warm', 'cool', 'none')),

  status text not null default 'planned' check (status in (
    'planned', 'briefed', 'written', 'shipped', 'dropped'
  )),
  notes text,

  seeded_from text,
  seeded_at timestamptz,

  created_at timestamptz default now(),
  updated_at timestamptz default now(),

  -- A slot with no anchor is a prompt, not a plan, and a prompt
  -- is what produced the three bad weeks. The only legitimate
  -- exception is a reactive slot, which is held open for a live
  -- signal and therefore cannot name an anchor at build time.
  -- Enforced here so no importer, route or agent can write the
  -- broken shape.
  constraint calendar_slots_anchor_required
    check (source_anchor is not null or anchor_pending),
  constraint calendar_slots_anchor_pending_reactive_only
    check (not anchor_pending or slot_type = 'reactive'),

  unique (company_id, week_number, year, day_of_week, slot_type)
);

comment on table public.calendar_slots is
  'The content calendar as data. One row per slot per week. Canonical from migration 032 onward: the markdown calendars become a generated export, not the source.';
comment on column public.calendar_slots.week_number is
  'ISO week derived from slot_date, so this joins correctly to weeks.week_number. NOT the number printed in the source markdown, which runs one lower.';
comment on column public.calendar_slots.source_week_label is
  'The week label exactly as written in the source calendar, for example "W36". Kept so the ISO offset stays auditable.';
comment on column public.calendar_slots.source_owner is
  'Who owns the substance of this slot. A named owner is what separates a plan from a prompt.';
comment on column public.calendar_slots.source_anchor is
  'The specific chapter, section, figure or pattern to open before writing. An anchor, not a topic area. "Ch07 Elastic Band, the stretch-too-far launch", not "messaging".';
comment on column public.calendar_slots.anchor_pending is
  'True only on reactive slots, which are held open for a live signal and get their anchor at planning time.';
comment on column public.calendar_slots.six_source_tags is
  'Legacy six-source tags S1 to S6 carried from the Q2 calendar for continuity with the override rules in content-strategy-framework.md.';
comment on column public.calendar_slots.post_type_slug is
  'Platform post type from src/lib/constants/post-types.ts. Null until mapped: the calendars name a production class, not a platform post type, and inferring the mapping is out of scope for the seed.';

create index idx_calendar_slots_week on public.calendar_slots(company_id, week_number, year);
create index idx_calendar_slots_date on public.calendar_slots(company_id, slot_date);
create index idx_calendar_slots_week_id on public.calendar_slots(week_id) where week_id is not null;

-- The working set. Shipped and dropped slots are history and are
-- read by date or by week, never by status.
create index idx_calendar_slots_open on public.calendar_slots(company_id, slot_date)
  where status in ('planned', 'briefed');

create trigger calendar_slots_updated_at before update on public.calendar_slots
  for each row execute function update_updated_at();

-- ============================================================
-- 3. slot_briefs
--
-- The brief a slot carries into writing. Versioned because a
-- rejected brief is evidence, not waste: the rejection_reason is
-- the training signal for the next attempt.
--
-- michael_angle is nullable because most slots do not need a
-- personal angle and forcing one is how synthetic personal
-- moments get written.
-- ============================================================
create table public.slot_briefs (
  id uuid primary key default gen_random_uuid(),
  slot_id uuid not null references public.calendar_slots(id) on delete cascade,

  owner text not null,
  argument text not null,
  why_not_obvious text,
  evidence text,
  evidence_provenance text,
  cost_of_wrong text,
  michael_angle text,
  do_not text,

  status text not null default 'draft' check (status in (
    'draft', 'submitted', 'rejected', 'approved'
  )),
  rejection_reason text,
  version integer not null default 1 check (version >= 1),
  created_by uuid references public.users(id),

  created_at timestamptz default now(),
  updated_at timestamptz default now(),

  -- A rejection with no reason teaches nothing.
  constraint slot_briefs_rejection_reason_required
    check (status <> 'rejected' or rejection_reason is not null),

  unique (slot_id, version)
);

comment on table public.slot_briefs is
  'Versioned brief per calendar slot. Rejected versions are retained because the rejection reason is the only durable record of why an approach failed.';
comment on column public.slot_briefs.evidence_provenance is
  'Where the evidence came from and whether it is cleared for public use. Separate from evidence so an unverified figure cannot travel as a verified one.';

-- One approved brief per slot at a time. Superseding an approved
-- brief means demoting the old one first, which is deliberate.
create unique index slot_briefs_one_approved_per_slot
  on public.slot_briefs (slot_id)
  where status = 'approved';

create index idx_slot_briefs_slot on public.slot_briefs(slot_id);
create index idx_slot_briefs_open on public.slot_briefs(status)
  where status in ('draft', 'submitted');

create trigger slot_briefs_updated_at before update on public.slot_briefs
  for each row execute function update_updated_at();

-- ============================================================
-- 4. voice_packs
--
-- The voice instructions handed to a writer for one post type.
-- canon_hashes records which canon documents the pack was built
-- from and at what content hash, so a pack can be invalidated
-- when its canon moves rather than quietly drifting out of date.
-- ============================================================
create table public.voice_packs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,

  post_type text not null,
  version integer not null default 1 check (version >= 1),
  content text not null,
  canon_hashes jsonb not null default '{}'::jsonb,
  sample_ids text[],
  seed text,

  status text not null default 'draft' check (status in ('draft', 'live', 'retired')),

  created_at timestamptz default now(),
  updated_at timestamptz default now(),

  unique (company_id, post_type, version)
);

comment on table public.voice_packs is
  'Versioned voice instructions per post type. Exactly one live pack per post type per company, enforced by partial unique index.';
comment on column public.voice_packs.canon_hashes is
  'Map of canon document path to content hash at build time. Lets a pack be flagged stale when its source canon changes instead of drifting silently.';
comment on column public.voice_packs.seed is
  'The opening fragment or worked example the pack seeds a writer with. Kept separate from content so it can be swapped without rebuilding the pack.';

create unique index voice_packs_one_live_per_post_type
  on public.voice_packs (company_id, post_type)
  where status = 'live';

create index idx_voice_packs_company on public.voice_packs(company_id);

create trigger voice_packs_updated_at before update on public.voice_packs
  for each row execute function update_updated_at();

-- ============================================================
-- 5. voice_samples
--
-- Real passages in the founder's voice, used as evidence of what
-- the voice actually is rather than a description of it.
--
-- endorsed defaults false and gates use: an unendorsed sample is
-- a candidate, not canon. provenance is mandatory in practice
-- because an unattributed sample cannot be verified and an
-- unverifiable sample is indistinguishable from generated text.
-- ============================================================
create table public.voice_samples (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,

  source_ref text not null,
  register text not null check (register in ('book', 'short', 'spoken')),
  loadbearers text[],
  post_types text[],
  excerpt text not null,
  provenance text not null,

  endorsed boolean not null default false,
  endorsed_at timestamptz,
  endorsed_by uuid references public.users(id),

  created_at timestamptz default now(),
  updated_at timestamptz default now(),

  -- An endorsement with no timestamp and no endorser is not an
  -- endorsement, it is a flag someone set.
  constraint voice_samples_endorsement_complete
    check (not endorsed or (endorsed_at is not null and endorsed_by is not null))
);

comment on table public.voice_samples is
  'Verbatim passages in the founder voice, with provenance. Evidence of the voice, not a description of it.';
comment on column public.voice_samples.loadbearers is
  'The specific words or constructions this sample is retained for, so a writer knows what to carry across rather than imitating the whole passage.';
comment on column public.voice_samples.register is
  'book = manuscript prose, short = social and email, spoken = transcript. Registers are not interchangeable and a book sample will not fix a short post.';

create index idx_voice_samples_company on public.voice_samples(company_id);
create index idx_voice_samples_endorsed on public.voice_samples(company_id, register)
  where endorsed;

create trigger voice_samples_updated_at before update on public.voice_samples
  for each row execute function update_updated_at();

-- ============================================================
-- 6. photo_inventory
--
-- Photo supply is the binding constraint on weekly volume, so it
-- has to be countable. distinct_scene exists because a raw file
-- count overstates the bank badly: 22 frames shot across three
-- minutes in one room are framing variety, not visual variety,
-- and posting them as if they were 22 scenes reads as stock.
--
-- used_in_weeks is an array rather than a join table because the
-- only question ever asked of it is "how many unused distinct
-- scenes remain", and that is a scan either way.
-- ============================================================
create table public.photo_inventory (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,

  file_ref text not null,
  scene_label text,
  source text not null check (source in ('photo_pack', 'weekly_capture', 'shoot')),
  distinct_scene boolean not null default true,
  used_in_weeks integer[] not null default '{}'::integer[],

  added_at timestamptz default now(),
  updated_at timestamptz default now(),

  -- Registering the same file twice would inflate the remaining
  -- scene count, which is the number the tier decision reads.
  unique (company_id, file_ref)
);

comment on table public.photo_inventory is
  'The photo bank. Counted before topics at weekly planning, because supply sets the tier and the tier sets the post count.';
comment on column public.photo_inventory.distinct_scene is
  'False for a frame that is a variation of a scene already counted. A raw file count overstates usable supply by roughly three times.';
comment on column public.photo_inventory.used_in_weeks is
  'ISO week numbers this file has already been published in. Empty array means unused.';

create index idx_photo_inventory_unused on public.photo_inventory(company_id)
  where distinct_scene and used_in_weeks = '{}'::integer[];

create trigger photo_inventory_updated_at before update on public.photo_inventory
  for each row execute function update_updated_at();

-- ============================================================
-- 7. slot_outcomes
--
-- What the slot actually did once published. Append only, so no
-- updated_at: a metric captured at a point in time is a fact
-- about that time and is never edited. Repeat captures for the
-- same slot are separate rows, which is what makes engagement
-- decay visible.
-- ============================================================
create table public.slot_outcomes (
  id uuid primary key default gen_random_uuid(),
  slot_id uuid not null references public.calendar_slots(id) on delete cascade,
  content_piece_ref uuid references public.content_pieces(id) on delete set null,

  impressions integer check (impressions >= 0),
  engagements integer check (engagements >= 0),
  captured_at timestamptz not null default now(),

  created_at timestamptz default now()
);

comment on table public.slot_outcomes is
  'Published performance per slot. Append only. Closes the loop from source contract to result, so the W43 and W47 review gates can be answered from data.';

create index idx_slot_outcomes_slot on public.slot_outcomes(slot_id, captured_at desc);

-- ============================================================
-- 8. Row Level Security
--
-- Same shape as 001: admin manages everything, a client reads
-- its own company's rows. Child tables (slot_briefs,
-- slot_outcomes) reach company_id through their parent slot,
-- matching the content_images pattern rather than denormalising.
-- ============================================================
alter table public.calendar_slots enable row level security;
alter table public.slot_briefs enable row level security;
alter table public.voice_packs enable row level security;
alter table public.voice_samples enable row level security;
alter table public.photo_inventory enable row level security;
alter table public.slot_outcomes enable row level security;

create policy "Admin reads all calendar slots" on public.calendar_slots
  for select using (public.get_user_role() = 'admin');
create policy "Client reads own calendar slots" on public.calendar_slots
  for select using (company_id = public.get_user_company_id());
create policy "Admin manages calendar slots" on public.calendar_slots
  for all using (public.get_user_role() = 'admin');

create policy "Read briefs via slot access" on public.slot_briefs
  for select using (
    exists (
      select 1 from public.calendar_slots
      where id = slot_briefs.slot_id
      and (
        public.get_user_role() = 'admin'
        or company_id = public.get_user_company_id()
      )
    )
  );
create policy "Admin manages briefs" on public.slot_briefs
  for all using (public.get_user_role() = 'admin');

create policy "Admin reads all voice packs" on public.voice_packs
  for select using (public.get_user_role() = 'admin');
create policy "Client reads own voice packs" on public.voice_packs
  for select using (company_id = public.get_user_company_id());
create policy "Admin manages voice packs" on public.voice_packs
  for all using (public.get_user_role() = 'admin');

create policy "Admin reads all voice samples" on public.voice_samples
  for select using (public.get_user_role() = 'admin');
create policy "Client reads own voice samples" on public.voice_samples
  for select using (company_id = public.get_user_company_id());
create policy "Admin manages voice samples" on public.voice_samples
  for all using (public.get_user_role() = 'admin');

create policy "Admin reads all photo inventory" on public.photo_inventory
  for select using (public.get_user_role() = 'admin');
create policy "Client reads own photo inventory" on public.photo_inventory
  for select using (company_id = public.get_user_company_id());
create policy "Admin manages photo inventory" on public.photo_inventory
  for all using (public.get_user_role() = 'admin');

create policy "Read outcomes via slot access" on public.slot_outcomes
  for select using (
    exists (
      select 1 from public.calendar_slots
      where id = slot_outcomes.slot_id
      and (
        public.get_user_role() = 'admin'
        or company_id = public.get_user_company_id()
      )
    )
  );
create policy "Admin manages outcomes" on public.slot_outcomes
  for all using (public.get_user_role() = 'admin');
