-- ============================================================
-- Content Operating System Expansion
-- Migration 002: Adds per-company API config, asset tracking,
-- multi-channel publishing, generation jobs, topic bank,
-- and company blueprints.
-- Purely additive — existing tables/data are not altered
-- except for widening two check constraints.
-- ============================================================

-- ============================================================
-- 1. company_api_configs
-- Per-company API provider selection + encrypted credentials
-- ============================================================
create table public.company_api_configs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  service_category text not null check (service_category in (
    'image_generation',
    'content_generation',
    'blog_publishing',
    'social_scheduling',
    'video_rendering',
    'transcription'
  )),
  provider text not null,
  credentials_encrypted text,
  provider_settings jsonb default '{}',
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(company_id, service_category, provider)
);

create index idx_api_configs_company on public.company_api_configs(company_id);
create index idx_api_configs_active on public.company_api_configs(company_id, service_category)
  where is_active = true;

create trigger company_api_configs_updated_at before update on public.company_api_configs
  for each row execute function update_updated_at();

-- ============================================================
-- 2. company_social_accounts
-- Linked social platform accounts with OAuth tokens
-- ============================================================
create table public.company_social_accounts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  platform text not null check (platform in (
    'linkedin_personal', 'linkedin_company',
    'twitter', 'bluesky', 'threads',
    'facebook', 'instagram'
  )),
  account_name text,
  account_id text,
  access_token_encrypted text,
  refresh_token_encrypted text,
  token_expires_at timestamptz,
  platform_metadata jsonb default '{}',
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(company_id, platform, account_id)
);

create index idx_social_accounts_company on public.company_social_accounts(company_id);

create trigger social_accounts_updated_at before update on public.company_social_accounts
  for each row execute function update_updated_at();

-- ============================================================
-- 3. company_blueprints
-- Company Blueprint document (drives content generation)
-- ============================================================
create table public.company_blueprints (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  version text not null default '1.0',
  blueprint_content text not null,
  derived_source_context text,
  derived_brand_context text,
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(company_id, version)
);

create index idx_blueprints_company on public.company_blueprints(company_id);

create trigger blueprints_updated_at before update on public.company_blueprints
  for each row execute function update_updated_at();

-- ============================================================
-- 4. topic_bank
-- Per-company topic bank (migrated from static markdown)
-- ============================================================
create table public.topic_bank (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  topic_number integer not null,
  title text not null,
  pillar text,
  audience_theme text,
  description text,
  source_reference text,
  is_used boolean default false,
  used_in_week_id uuid references public.weeks(id) on delete set null,
  created_at timestamptz default now(),
  unique(company_id, topic_number)
);

create index idx_topic_bank_company on public.topic_bank(company_id);
create index idx_topic_bank_unused on public.topic_bank(company_id)
  where is_used = false;

-- ============================================================
-- 5. content_generation_jobs
-- Track async generation jobs (Claude, image gen, video render)
-- Must be created BEFORE content_pieces is altered (FK target)
-- ============================================================
create table public.content_generation_jobs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  week_id uuid references public.weeks(id) on delete set null,
  content_piece_id uuid references public.content_pieces(id) on delete set null,
  job_type text not null check (job_type in (
    'content_generation',
    'image_generation',
    'video_rendering',
    'transcription',
    'pdf_generation',
    'platform_adaptation'
  )),
  provider text,
  status text not null default 'queued' check (status in (
    'queued', 'running', 'completed', 'failed', 'cancelled'
  )),
  input_payload jsonb default '{}',
  output_payload jsonb default '{}',
  error_message text,
  progress integer default 0 check (progress >= 0 and progress <= 100),
  started_at timestamptz,
  completed_at timestamptz,
  triggered_by uuid references public.users(id),
  created_at timestamptz default now()
);

create index idx_gen_jobs_company on public.content_generation_jobs(company_id);
create index idx_gen_jobs_week on public.content_generation_jobs(week_id);
create index idx_gen_jobs_status on public.content_generation_jobs(status)
  where status in ('queued', 'running');
create index idx_gen_jobs_piece on public.content_generation_jobs(content_piece_id);

-- ============================================================
-- 6. Widen existing constraints on content_pieces
-- ============================================================

-- Add 'video_script' to content_type
alter table public.content_pieces
  drop constraint content_pieces_content_type_check;
alter table public.content_pieces
  add constraint content_pieces_content_type_check
  check (content_type in (
    'social_post', 'blog_article', 'linkedin_article', 'pdf_guide', 'video_script'
  ));

-- Add optional FK to content_generation_jobs for traceability
alter table public.content_pieces
  add column generation_job_id uuid references public.content_generation_jobs(id);

-- ============================================================
-- 7. content_assets
-- All associated assets per content piece
-- ============================================================
create table public.content_assets (
  id uuid primary key default gen_random_uuid(),
  content_piece_id uuid not null references public.content_pieces(id) on delete cascade,
  asset_type text not null check (asset_type in (
    'seo_title',
    'seo_meta_description',
    'url_slug',
    'excerpt',
    'categories_tags',
    'featured_image',
    'social_share_image',
    'in_article_image',
    'header_image',
    'personal_distribution_copy',
    'company_distribution_copy',
    'newsletter_name',
    'pdf_file',
    'cover_image',
    'page_zone_spec',
    'script_text',
    'storyboard',
    'intro_outro_spec',
    'broll_timestamps',
    'subtitle_cues',
    'platform_copy',
    'custom'
  )),
  text_content text,
  file_url text,
  storage_path text,
  asset_metadata jsonb default '{}',
  sort_order integer default 0,
  created_at timestamptz default now()
);

create index idx_content_assets_piece on public.content_assets(content_piece_id);
create index idx_content_assets_type on public.content_assets(content_piece_id, asset_type);

-- ============================================================
-- 8. platform_variants
-- Platform-specific adaptations of social posts
-- ============================================================
create table public.platform_variants (
  id uuid primary key default gen_random_uuid(),
  content_piece_id uuid not null references public.content_pieces(id) on delete cascade,
  social_account_id uuid references public.company_social_accounts(id) on delete set null,
  platform text not null check (platform in (
    'linkedin_personal', 'linkedin_company',
    'twitter', 'bluesky', 'threads',
    'facebook', 'instagram'
  )),
  adapted_copy text not null,
  adapted_first_comment text,
  character_count integer,
  hashtags text[],
  mentions text[],
  image_ids uuid[],
  scheduled_at timestamptz,
  is_selected boolean default false,
  platform_metadata jsonb default '{}',
  approval_status text not null default 'pending'
    check (approval_status in ('pending', 'approved', 'changes_requested')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index idx_platform_variants_piece on public.platform_variants(content_piece_id);
create index idx_platform_variants_platform on public.platform_variants(platform);
create index idx_platform_variants_selected on public.platform_variants(content_piece_id)
  where is_selected = true;

create trigger platform_variants_updated_at before update on public.platform_variants
  for each row execute function update_updated_at();

-- ============================================================
-- 9. publishing_jobs
-- Track publishing to external platforms
-- ============================================================
create table public.publishing_jobs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  content_piece_id uuid references public.content_pieces(id) on delete set null,
  platform_variant_id uuid references public.platform_variants(id) on delete set null,
  target_platform text not null,
  api_config_id uuid references public.company_api_configs(id),
  social_account_id uuid references public.company_social_accounts(id),
  status text not null default 'queued' check (status in (
    'queued', 'running', 'published', 'failed', 'scheduled', 'cancelled'
  )),
  external_id text,
  external_url text,
  publish_payload jsonb default '{}',
  response_payload jsonb default '{}',
  error_message text,
  scheduled_for timestamptz,
  published_at timestamptz,
  triggered_by uuid references public.users(id),
  created_at timestamptz default now()
);

create index idx_pub_jobs_company on public.publishing_jobs(company_id);
create index idx_pub_jobs_piece on public.publishing_jobs(content_piece_id);
create index idx_pub_jobs_status on public.publishing_jobs(status)
  where status in ('queued', 'running', 'scheduled');

-- ============================================================
-- 10. Widen notification types
-- ============================================================
alter table public.notifications
  drop constraint notifications_type_check;
alter table public.notifications
  add constraint notifications_type_check
  check (type in (
    'content_ready', 'piece_approved', 'changes_requested', 'comment_added',
    'generation_complete', 'generation_failed',
    'publishing_complete', 'publishing_failed'
  ));

-- ============================================================
-- 11. Row Level Security for all new tables
-- ============================================================

alter table public.company_api_configs enable row level security;
alter table public.company_social_accounts enable row level security;
alter table public.company_blueprints enable row level security;
alter table public.topic_bank enable row level security;
alter table public.content_generation_jobs enable row level security;
alter table public.content_assets enable row level security;
alter table public.platform_variants enable row level security;
alter table public.publishing_jobs enable row level security;

-- company_api_configs
create policy "Admin manages api configs" on public.company_api_configs
  for all using (public.get_user_role() = 'admin');
create policy "Client reads own api configs" on public.company_api_configs
  for select using (company_id = public.get_user_company_id());

-- company_social_accounts
create policy "Admin manages social accounts" on public.company_social_accounts
  for all using (public.get_user_role() = 'admin');
create policy "Client reads own social accounts" on public.company_social_accounts
  for select using (company_id = public.get_user_company_id());

-- company_blueprints
create policy "Admin manages blueprints" on public.company_blueprints
  for all using (public.get_user_role() = 'admin');
create policy "Client reads own blueprint" on public.company_blueprints
  for select using (company_id = public.get_user_company_id());

-- topic_bank
create policy "Admin manages topic bank" on public.topic_bank
  for all using (public.get_user_role() = 'admin');
create policy "Client reads own topics" on public.topic_bank
  for select using (company_id = public.get_user_company_id());

-- content_generation_jobs
create policy "Admin manages gen jobs" on public.content_generation_jobs
  for all using (public.get_user_role() = 'admin');
create policy "Client reads own gen jobs" on public.content_generation_jobs
  for select using (company_id = public.get_user_company_id());

-- content_assets (follows parent content_piece access)
create policy "Admin manages assets" on public.content_assets
  for all using (public.get_user_role() = 'admin');
create policy "Read assets via piece access" on public.content_assets
  for select using (
    exists (
      select 1 from public.content_pieces
      where id = content_assets.content_piece_id
      and (
        public.get_user_role() = 'admin'
        or company_id = public.get_user_company_id()
      )
    )
  );

-- platform_variants (follows parent content_piece access + client can update approval)
create policy "Admin manages variants" on public.platform_variants
  for all using (public.get_user_role() = 'admin');
create policy "Read variants via piece access" on public.platform_variants
  for select using (
    exists (
      select 1 from public.content_pieces
      where id = platform_variants.content_piece_id
      and (
        public.get_user_role() = 'admin'
        or company_id = public.get_user_company_id()
      )
    )
  );
create policy "Client updates variant approval" on public.platform_variants
  for update using (
    exists (
      select 1 from public.content_pieces
      where id = platform_variants.content_piece_id
      and company_id = public.get_user_company_id()
    )
  );

-- publishing_jobs
create policy "Admin manages pub jobs" on public.publishing_jobs
  for all using (public.get_user_role() = 'admin');
create policy "Client reads own pub jobs" on public.publishing_jobs
  for select using (company_id = public.get_user_company_id());
