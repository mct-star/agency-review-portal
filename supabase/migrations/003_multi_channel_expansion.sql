-- ============================================================
-- Multi-Channel Content Distribution Expansion
-- Migration 003: Widens platform constraints, adds adaptation
-- types, thread support, canonical URL tracking, and content
-- syndication link tracking.
-- Purely additive — existing data remains valid.
-- ============================================================

-- ============================================================
-- 1. Widen company_social_accounts platform CHECK
-- Adds: tiktok, substack, medium, youtube, youtube_shorts
-- ============================================================
alter table public.company_social_accounts
  drop constraint company_social_accounts_platform_check;
alter table public.company_social_accounts
  add constraint company_social_accounts_platform_check
  check (platform in (
    'linkedin_personal', 'linkedin_company',
    'twitter', 'bluesky', 'threads',
    'facebook', 'instagram',
    'tiktok',
    'substack', 'medium',
    'youtube', 'youtube_shorts'
  ));

-- ============================================================
-- 2. Widen platform_variants platform CHECK
-- Adds same new platforms
-- ============================================================
alter table public.platform_variants
  drop constraint platform_variants_platform_check;
alter table public.platform_variants
  add constraint platform_variants_platform_check
  check (platform in (
    'linkedin_personal', 'linkedin_company',
    'twitter', 'bluesky', 'threads',
    'facebook', 'instagram',
    'tiktok',
    'substack', 'medium',
    'youtube', 'youtube_shorts'
  ));

-- ============================================================
-- 3. Add new columns to platform_variants
-- adaptation_type: which transformation was used
-- thread_parts: array of individual posts for threads
-- canonical_url: for article syndication
-- media_urls: for video/media attachments
-- ============================================================
alter table public.platform_variants
  add column adaptation_type text not null default 'copy_adapt'
    check (adaptation_type in (
      'copy_adapt', 'thread_expand', 'link_post',
      'promo_post', 'caption_generate',
      'newsletter_format', 'article_syndicate',
      'video_metadata'
    ));

alter table public.platform_variants
  add column thread_parts text[];

alter table public.platform_variants
  add column canonical_url text;

alter table public.platform_variants
  add column media_urls text[];

-- ============================================================
-- 4. Widen company_api_configs service_category CHECK
-- Adds: newsletter_publishing, content_syndication, video_hosting
-- ============================================================
alter table public.company_api_configs
  drop constraint company_api_configs_service_category_check;
alter table public.company_api_configs
  add constraint company_api_configs_service_category_check
  check (service_category in (
    'image_generation',
    'content_generation',
    'blog_publishing',
    'social_scheduling',
    'video_rendering',
    'transcription',
    'newsletter_publishing',
    'content_syndication',
    'video_hosting'
  ));

-- ============================================================
-- 5. Add canonical_url to publishing_jobs
-- Tracks canonical source when syndicating articles
-- ============================================================
alter table public.publishing_jobs
  add column canonical_url text;

-- ============================================================
-- 6. content_syndication_links
-- Tracks where articles have been published across platforms
-- with canonical URL management
-- ============================================================
create table public.content_syndication_links (
  id uuid primary key default gen_random_uuid(),
  content_piece_id uuid not null references public.content_pieces(id) on delete cascade,
  platform text not null,
  external_url text not null,
  is_canonical boolean default false,
  published_at timestamptz,
  created_at timestamptz default now()
);

create index idx_syndication_piece on public.content_syndication_links(content_piece_id);

-- Only one canonical link per content piece
create unique index idx_syndication_canonical on public.content_syndication_links(content_piece_id)
  where is_canonical = true;

-- RLS
alter table public.content_syndication_links enable row level security;

create policy "Admin manages syndication" on public.content_syndication_links
  for all using (public.get_user_role() = 'admin');

create policy "Client reads syndication" on public.content_syndication_links
  for select using (
    exists (
      select 1 from public.content_pieces
      where id = content_syndication_links.content_piece_id
      and company_id = public.get_user_company_id()
    )
  );
