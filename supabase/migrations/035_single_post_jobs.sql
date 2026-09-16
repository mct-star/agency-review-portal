-- 035: single_post jobs. One MCT post for one calendar slot, queued from
-- the Week Board ("Today's post") or a Source Calendar slot, consumed by
-- the Mac job bridge poller (SinglePostHandler). Applied 16 Sept 2026.
alter table public.content_generation_jobs drop constraint content_generation_jobs_job_type_check;
alter table public.content_generation_jobs add constraint content_generation_jobs_job_type_check
  check (job_type = any (array['content_generation','image_generation','video_rendering','transcription','pdf_generation','platform_adaptation','weekly_production','single_post']));

-- One live job per slot. week_id is null on these rows (calendar_slots are
-- not linked to weeks), so the (week_id, job_type) index does not apply.
create unique index if not exists content_generation_jobs_single_post_active_uniq
  on public.content_generation_jobs ((input_payload->>'slot_id'))
  where job_type = 'single_post' and status in ('queued','running');
create index if not exists idx_gen_jobs_single_post_slot
  on public.content_generation_jobs ((input_payload->>'slot_id'), created_at desc)
  where job_type = 'single_post';
