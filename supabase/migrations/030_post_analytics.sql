-- 030_post_analytics.sql
-- LinkedIn post analytics tracking
-- Stores engagement metrics polled from LinkedIn after publishing

CREATE TABLE IF NOT EXISTS public.post_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_piece_id UUID REFERENCES public.content_pieces(id) ON DELETE CASCADE,
  publishing_job_id UUID REFERENCES public.publishing_jobs(id) ON DELETE CASCADE,
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,

  -- LinkedIn metrics
  platform TEXT DEFAULT 'linkedin',
  external_post_id TEXT, -- the LinkedIn post URN
  impressions INT DEFAULT 0,
  likes INT DEFAULT 0,
  comments INT DEFAULT 0,
  shares INT DEFAULT 0,
  clicks INT DEFAULT 0,
  engagement_rate DECIMAL(5,2) DEFAULT 0, -- percentage

  -- Derived insights
  post_type TEXT, -- from content_pieces.post_type
  day_of_week TEXT,
  posted_at TIMESTAMPTZ,

  -- Tracking
  last_polled_at TIMESTAMPTZ,
  poll_count INT DEFAULT 0,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Unique constraint for upsert by publishing_job_id
CREATE UNIQUE INDEX IF NOT EXISTS idx_post_analytics_job_unique ON public.post_analytics(publishing_job_id);

CREATE INDEX IF NOT EXISTS idx_post_analytics_company ON public.post_analytics(company_id);
CREATE INDEX IF NOT EXISTS idx_post_analytics_piece ON public.post_analytics(content_piece_id);

-- Updated_at trigger
CREATE TRIGGER post_analytics_updated_at BEFORE UPDATE ON public.post_analytics
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE public.post_analytics ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can view own company analytics" ON public.post_analytics;
  CREATE POLICY "Users can view own company analytics" ON public.post_analytics
    FOR ALL USING (
      company_id IN (SELECT company_id FROM public.users WHERE id = auth.uid())
      OR EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
    );
END $$;
