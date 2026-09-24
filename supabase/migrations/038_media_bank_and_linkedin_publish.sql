-- Applied 24 Sept 2026.

-- The photo bank becomes the photo and video bank: real photos and footage of
-- the spokesperson, tagged so generation and review can pick from them.
alter table photo_inventory add column if not exists kind text not null default 'photo';
alter table photo_inventory add constraint photo_inventory_kind_check check (kind in ('photo','video'));
alter table photo_inventory add column if not exists tags text[] not null default '{}';
alter table photo_inventory add column if not exists shows_spokesperson boolean not null default true;
alter table photo_inventory add column if not exists text_space boolean not null default false;
alter table photo_inventory add column if not exists duration_seconds numeric;
alter table photo_inventory add column if not exists notes text;
alter table photo_inventory add column if not exists last_used_at timestamptz;
alter table photo_inventory drop constraint if exists photo_inventory_source_check;
alter table photo_inventory add constraint photo_inventory_source_check check (source in ('photo_pack','weekly_capture','shoot','bank_upload'));
create index if not exists photo_inventory_company_kind_idx on photo_inventory (company_id, kind, added_at desc);

-- LinkedIn posts are published by the Mac poller with the Mac's token.
alter table content_generation_jobs drop constraint if exists content_generation_jobs_job_type_check;
alter table content_generation_jobs add constraint content_generation_jobs_job_type_check check (job_type = any (array['content_generation','image_generation','video_rendering','transcription','pdf_generation','platform_adaptation','weekly_production','single_post','video_post','linkedin_publish']));
