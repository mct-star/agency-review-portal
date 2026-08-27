-- ============================================================
-- Media uploads: private capture bucket + provenance on the
-- photo bank
-- Migration 033
--
-- Phone media cannot reach Supabase through any existing route.
-- Every upload path in this repo proxies multipart through a
-- Next.js API route, and Vercel caps a serverless request body
-- at 4.5MB, so a 2GB .mov is rejected before a single byte of
-- application code runs. The fix is browser-direct upload
-- against a server-minted signed upload URL, which never touches
-- the function at all.
--
-- That moves raw footage into storage, so storage now has to
-- distinguish raw from published. Raw personal capture is not
-- something to leave on a permanent public URL, so it lands in
-- a new PRIVATE bucket `captures` and is read back only through
-- short-lived server-minted signed URLs. Anything that becomes
-- part of a post is copied into the existing public
-- `content-assets` bucket at attach time, which is why nothing
-- downstream (content_images.public_url, the Metricool CSV)
-- ever has to understand a signed URL or an expiry.
--
-- No storage RLS policy is added or needed. Signed upload URLs
-- are minted server-side with the service role, and private
-- reads are minted the same way, so the anon role never has a
-- reason to touch this bucket.
--
-- Additive only. Nothing in 031 or 032 is altered.
--
-- Numbering: this repo has collisions at 024 (two files) and 027
-- (one file in supabase/migrations/ never run, one in supabase/
-- root already run). 028, 029, 030 ran from supabase/ root. 031
-- and 032 took the first free numbers and 033 is the next.
-- ============================================================

-- ============================================================
-- 1. photo_inventory: where the file actually is
--
-- 032 shipped photo_inventory with file_ref as the only handle
-- on a photo, which was correct while every photo lived in a
-- Drive folder and file_ref was a filename a human recognised.
-- A browser-uploaded photo has no such name, so the row needs
-- to carry the storage coordinates and the facts a tier
-- decision or a duplicate check might want (dimensions, size,
-- what the file was called on the phone).
--
-- All nullable, because the existing rows are Drive-referenced
-- and there is no value to backfill them with. Null here means
-- "not in our storage", not "unknown".
-- ============================================================
alter table public.photo_inventory
  add column storage_path text,
  add column bucket text,
  add column mime_type text,
  add column width integer,
  add column height integer,
  add column size_bytes bigint,
  add column original_filename text;

comment on column public.photo_inventory.storage_path is
  'Object key within `bucket`. Null on a legacy row whose photo lives in Google Drive and is identified only by file_ref.';
comment on column public.photo_inventory.bucket is
  'Supabase Storage bucket holding the object, normally `captures`. Null on a legacy Drive-referenced row.';
comment on column public.photo_inventory.mime_type is
  'Mime type as declared at upload. Null on a legacy Drive-referenced row.';
comment on column public.photo_inventory.width is
  'Pixel width, read in the browser before upload. Null on a legacy Drive-referenced row, or where the browser could not decode the file.';
comment on column public.photo_inventory.height is
  'Pixel height, read in the browser before upload. Null on a legacy Drive-referenced row, or where the browser could not decode the file.';
comment on column public.photo_inventory.size_bytes is
  'Byte size at upload. Null on a legacy Drive-referenced row.';
comment on column public.photo_inventory.original_filename is
  'Filename as it came off the device, kept because the sanitised storage key discards it. Null on a legacy Drive-referenced row.';

-- ============================================================
-- 2. Per-clip single-flight guard
--
-- 031 stopped two concurrent weekly_production runs for the same
-- week at the database level rather than in application logic.
-- Video rendering needs the same protection at a finer grain: a
-- render is minutes long and expensive, and a double-click or a
-- retried request would otherwise start a second one for the
-- same clip.
--
-- content_piece_id is nullable on content_generation_jobs, and a
-- partial index over a nullable column would otherwise treat
-- every null as distinct, so the predicate excludes nulls
-- explicitly rather than relying on that behaviour being
-- obvious to the next reader.
--
-- job_type is fixed in the predicate rather than being part of
-- the index key, because this constrains video renders only. A
-- concurrent image_generation job for the same piece is
-- legitimate and must stay possible.
-- ============================================================
create unique index content_generation_jobs_piece_video_active_uniq
  on public.content_generation_jobs (content_piece_id)
  where job_type = 'video_rendering'
    and status in ('queued', 'running')
    and content_piece_id is not null;

comment on index public.content_generation_jobs_piece_video_active_uniq is
  'Per-clip single-flight. A second render queued for a piece that already has one queued or running fails 23505 at insert, which callers surface as 409 rather than reasoning about it in application code.';

-- ============================================================
-- 3. The `captures` bucket
--
-- Private, unlike `content-assets` and `media`, which are both
-- public. Raw phone footage and unedited photos are personal
-- material and a permanent public URL is a permanent leak.
--
-- 2GB ceiling because that is roughly a long 4K clip off an
-- iPhone, and a limit enforced by storage is a limit the client
-- cannot talk its way past.
--
-- HEIC and HEIF are deliberately absent from the allowlist. The
-- pipeline downstream (Sharp, the LinkedIn API, Metricool)
-- cannot read them, so accepting them here would only move the
-- failure somewhere less legible. The sign route rejects them
-- with an instruction to change the iPhone camera setting.
--
-- The existing buckets were created by hand in the dashboard.
-- This one is created in SQL so the definition is reviewable and
-- the mime allowlist sits in version control next to the route
-- that enforces the same list.
-- ============================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'captures',
  'captures',
  false,
  2147483648,
  array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'video/mp4',
    'video/quicktime',
    'video/webm'
  ]
)
on conflict (id) do nothing;
