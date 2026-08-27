-- ============================================================
-- Public `renders` bucket for finished video output
-- Migration 034
--
-- The plan was to land Mac-rendered clips in the existing public
-- `media` bucket. The first end-to-end render (27 Aug 2026)
-- surfaced why that cannot work and never could have: `media` was
-- dashboard-created with an image-only mime allowlist and a 10MB
-- file cap, so the storage API refuses video/mp4 outright. The
-- pre-existing /api/upload/video route, which targets `media`
-- with a 100MB code check, could therefore never have stored a
-- video even before Vercel's 4.5MB body cap is considered.
--
-- `content-assets` would technically accept anything (it has no
-- allowlist and no size cap at all), but an unbounded bucket is
-- the opposite of the discipline the `captures` bucket set in
-- 033. Finished renders get their own public bucket with an
-- explicit contract instead: video plus thumbnail mimes only,
-- 1GB ceiling, definition in version control.
-- ============================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'renders',
  'renders',
  true,
  1073741824,
  array['video/mp4', 'image/jpeg', 'image/png']
)
on conflict (id) do nothing;
