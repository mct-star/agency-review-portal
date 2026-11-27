-- 047_post_analytics_post_key.sql
-- The daily LinkedIn figures job stores every post it can read, including posts
-- published outside the portal (no publishing_job_id or content_piece_id: both
-- columns are already nullable). One row per LinkedIn post, whoever published it:
-- the unique key is the platform and the post URN. NULL post ids stay allowed.
-- Safe to re-run. post_analytics held 0 rows when this was written.

CREATE UNIQUE INDEX IF NOT EXISTS idx_post_analytics_platform_post
  ON public.post_analytics (platform, external_post_id);
