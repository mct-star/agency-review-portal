-- Blog image record (15 Nov 2026).
--
-- One nullable jsonb column on public.content_images holding the image's
-- record for the blog image gate: role, type, passage, treatment and alt text.
-- Null means no record yet. Nothing reads the column until a later change.
--
-- Safe to run twice: add column if not exists.

alter table public.content_images add column if not exists image_record jsonb;
