-- ============================================================
-- 028: Calendar Enhancements — image URLs + reschedule support
-- ============================================================
-- Adds cover_image_url to content_pieces for calendar thumbnails.
-- Run in Supabase Dashboard → SQL Editor.

-- 1. Add cover_image_url column to content_pieces
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'content_pieces' AND column_name = 'cover_image_url'
  ) THEN
    ALTER TABLE content_pieces ADD COLUMN cover_image_url TEXT;
  END IF;
END $$;

-- 2. Add scheduled_date for precise scheduling (optional, future use)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'content_pieces' AND column_name = 'scheduled_date'
  ) THEN
    ALTER TABLE content_pieces ADD COLUMN scheduled_date DATE;
  END IF;
END $$;

-- 3. Add publish_status for lifecycle tracking (draft/scheduled/published/failed)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'content_pieces' AND column_name = 'publish_status'
  ) THEN
    ALTER TABLE content_pieces ADD COLUMN publish_status TEXT DEFAULT 'draft'
      CHECK (publish_status IN ('draft', 'scheduled', 'published', 'failed'));
  END IF;
END $$;

-- 4. Index for calendar date lookups
CREATE INDEX IF NOT EXISTS idx_content_pieces_scheduled_date
  ON content_pieces(scheduled_date) WHERE scheduled_date IS NOT NULL;
