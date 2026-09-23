-- ============================================================
-- Post types: meme and four video formats
-- Migration 036
--
-- The post-type registry (src/lib/constants/post-types.ts) gained a
-- meme post type and four video post types (podcast hook clip,
-- talking head, story video, reaction/ranking). This migration adds
-- the matching public.post_types template rows and widens the three
-- check constraints that would otherwise reject them: content_pieces
-- and calendar_slots take a 'video' and 'meme' lane, and
-- content_generation_jobs takes a 'video_post' job type for the Mac
-- video pipeline handoff.
--
-- Additive only. Nothing in 001-035 is touched.
-- ============================================================

-- ============================================================
-- 1. post_types: meme and video templates
-- ============================================================
insert into public.post_types (slug, label, content_type, word_count_min, word_count_max, default_image_archetype, template_instructions)
values
  (
    'meme',
    'Meme',
    'social_post',
    4,
    20,
    'meme_card',
    'One industry inside joke a week on the founder feed. Write a setup line and a punchline, under 20 words combined for the on-image text. No statistics. No client names. No emojis. The image generator is not yet wired for this archetype: return the text and mark the image as pending rather than failing.'
  ),
  (
    'podcast_hook_clip',
    'Podcast hook clip',
    'video_script',
    null,
    null,
    'video_podcast_hook',
    'A 30 to 60 second clip built from the podcast library, produced on the Mac. Hook: a question of 10 seconds or less. Layout: one speaker in frame, purple wipe between hook and answer. Captions: burned in, active word highlighted. Source: podcast library.'
  ),
  (
    'talking_head',
    'Thought of the day',
    'video_script',
    null,
    null,
    'video_talking_head',
    'A 30 to 60 second vertical talking-head clip, produced on the Mac. Hook: bold statement in the first 5 seconds. Layout: vertical 1080x1920 phone clip. Captions: burned in at chest height. Source: phone clip uploaded on Clips.'
  ),
  (
    'story_video',
    'Story video',
    'video_script',
    null,
    null,
    'video_story',
    'A 40 to 90 second B-roll story video carrying one sourced number, produced on the Mac. Hook: a question of 10 seconds or less carrying one sourced number. Layout: full-screen B-roll, new shot every 1 to 1.5 seconds, 9:16 and 1:1. Captions: none burned in, .srt delivered. Source: story bank plus B-roll.'
  ),
  (
    'reaction_ranking',
    'Reaction or ranking video',
    'video_script',
    60,
    150,
    'video_reaction_ranking',
    'A 30 to 60 second reaction or ranking video. Michael films it, the platform holds the script and brief. Hook: a "Ranking ..." title or the best example first. Layout: head and shoulders top, material bottom, captions centre. Captions: burned in centre. Source: Michael films; platform holds the script and brief.'
  )
on conflict (slug) do nothing;

-- ============================================================
-- 2. content_pieces.content_type: add video and meme
-- ============================================================
alter table public.content_pieces drop constraint if exists content_pieces_content_type_check;
alter table public.content_pieces add constraint content_pieces_content_type_check
  check (content_type = any (array['social_post', 'blog_article', 'linkedin_article', 'pdf_guide', 'video_script', 'video', 'meme']));

-- ============================================================
-- 3. calendar_slots.slot_type: add video and meme
-- ============================================================
alter table public.calendar_slots drop constraint if exists calendar_slots_slot_type_check;
alter table public.calendar_slots add constraint calendar_slots_slot_type_check
  check (slot_type = any (array['thesis', 'doc', 'carousel', 'reactive', 'video', 'meme']));

-- ============================================================
-- 4. content_generation_jobs.job_type: add video_post
-- ============================================================
alter table public.content_generation_jobs drop constraint if exists content_generation_jobs_job_type_check;
alter table public.content_generation_jobs add constraint content_generation_jobs_job_type_check
  check (job_type = any (array['content_generation', 'image_generation', 'video_rendering', 'transcription', 'pdf_generation', 'platform_adaptation', 'weekly_production', 'single_post', 'video_post']));
