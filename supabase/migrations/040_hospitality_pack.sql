-- ============================================================
-- Hospitality post-type pack and Facebook/Instagram targeting
-- Migration 040
--
-- A company chooses one pack of post types: 'b2b' (the LinkedIn
-- set, the default for everyone that exists today) or
-- 'hospitality' (weather, special, what's on, live scene, event,
-- written for Facebook and Instagram).
--
-- social_networks is where a company's posts go when exported to
-- the scheduler's CSV. Empty means LinkedIn only, which is what
-- every existing company already does, so nothing changes for
-- them. A hospitality company is set to facebook and instagram.
--
-- hospitality_settings holds the soft settings that shape the
-- writing (what the venue is, standing hashtags, whether emoji
-- are wanted). Settings the scheduler must query (position,
-- time zone, post time) get real columns in migration 041.
--
-- content_pieces gains auto_source (which automation made a
-- draft, null for a person) and source_meta (what it was built
-- from, for example the forecast and the photo chosen).
--
-- Additive only. Run in the Supabase SQL editor.
-- ============================================================

alter table public.companies
  add column if not exists post_pack text not null default 'b2b',
  add column if not exists hospitality_settings jsonb not null default '{}'::jsonb,
  add column if not exists social_networks text[] not null default '{}';

alter table public.companies drop constraint if exists companies_post_pack_check;
alter table public.companies
  add constraint companies_post_pack_check check (post_pack in ('b2b', 'hospitality'));

alter table public.companies drop constraint if exists companies_social_networks_check;
alter table public.companies
  add constraint companies_social_networks_check
  check (social_networks <@ array['linkedin', 'facebook', 'instagram', 'threads', 'bluesky', 'x', 'tiktok', 'gbp']::text[]);

comment on column public.companies.post_pack is
  'Which pack of post types the company writes: b2b (LinkedIn) or hospitality (Facebook and Instagram).';
comment on column public.companies.social_networks is
  'Networks the scheduler CSV export targets. Empty = LinkedIn only.';
comment on column public.companies.hospitality_settings is
  'Soft settings for hospitality writing: venue_notes, standing_hashtags (text[]), allow_emoji (bool).';

alter table public.content_pieces
  add column if not exists auto_source text,
  add column if not exists source_meta jsonb;

alter table public.content_pieces drop constraint if exists content_pieces_auto_source_check;
alter table public.content_pieces
  add constraint content_pieces_auto_source_check
  check (auto_source is null or auto_source in ('weather_job', 'weekly_interview', 'quick_post'));

comment on column public.content_pieces.auto_source is
  'Which automation drafted this piece. Null for a piece a person made. Automated drafts always start pending: nothing publishes without approval.';

-- Template rows for the five hospitality post types, mirroring the registry
-- in src/lib/constants/post-types.ts.
insert into public.post_types (slug, label, content_type, word_count_min, word_count_max, default_image_archetype, template_instructions)
values
  ('weather_of_the_day', 'Weather of the day', 'social_post', 30, 70, 'library_photo',
   'Today''s weather in a line or two, then why it is a good day to come in. Uses only the forecast supplied. A library photo that matches the weather and the place.'),
  ('special_of_the_day', 'Special of the day', 'social_post', 35, 80, 'library_photo',
   'One dish or drink, described only with the details supplied. No invented prices, ingredients or times. A library photo of the food or drink.'),
  ('whats_on_this_week', 'What''s on this week', 'social_post', 60, 130, 'library_photo',
   'The week at the venue, day by day, from the list supplied. Nothing that is not on the list.'),
  ('live_scene', 'Live scene', 'social_post', 20, 55, 'library_photo',
   'What it is like right now: fully booked tonight, a busy garden. Short, present tense, from the note supplied.'),
  ('event', 'Event', 'social_post', 60, 120, 'library_photo',
   'An event with its name, date, time and how to book, exactly as supplied. A library photo from a past event or of the place.')
on conflict (slug) do nothing;
