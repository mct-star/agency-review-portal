-- ============================================================
-- 027: Strategy Interview & Content Strategy Tables
-- ============================================================
-- Supports the 8-step strategy interview flow and strategy document generation.
-- Run in Supabase Dashboard > SQL Editor.

-- 1. Strategy interview sessions
CREATE TABLE IF NOT EXISTS strategy_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  current_step INT NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed', 'abandoned')),
  responses JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for fast lookup by company
CREATE INDEX IF NOT EXISTS idx_strategy_sessions_company ON strategy_sessions(company_id);

-- 2. Audience personas (from step 2)
CREATE TABLE IF NOT EXISTS strategy_audiences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  persona_name TEXT NOT NULL,
  job_title TEXT,
  seniority TEXT,
  primary_problem TEXT,
  search_terms TEXT[] DEFAULT '{}',
  pain_points TEXT[] DEFAULT '{}',
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_strategy_audiences_company ON strategy_audiences(company_id);

-- 3. Positioning & differentiation (from step 3)
CREATE TABLE IF NOT EXISTS strategy_positioning (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  positioning_statement TEXT,
  differentiators TEXT[] DEFAULT '{}',
  competitor_mistakes TEXT,
  transformation_before TEXT,
  transformation_after TEXT,
  storybrand_guide TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_strategy_positioning_company ON strategy_positioning(company_id);

-- 4. Narrative arc (from step 7) -- 12-week plan
CREATE TABLE IF NOT EXISTS strategy_narrative_arcs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  week_number INT NOT NULL,
  phase TEXT NOT NULL DEFAULT 'establish' CHECK (phase IN ('establish', 'build', 'challenge', 'convert')),
  theme_focus TEXT,
  topic_focus TEXT,
  post_type_emphasis TEXT[] DEFAULT '{}',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(company_id, week_number)
);

CREATE INDEX IF NOT EXISTS idx_strategy_narrative_arcs_company ON strategy_narrative_arcs(company_id);

-- 5. Generated strategy documents
CREATE TABLE IF NOT EXISTS strategy_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  version INT NOT NULL DEFAULT 1,
  content JSONB NOT NULL DEFAULT '{}',
  pdf_url TEXT,
  share_token TEXT UNIQUE,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_strategy_documents_company ON strategy_documents(company_id);
CREATE INDEX IF NOT EXISTS idx_strategy_documents_share_token ON strategy_documents(share_token) WHERE share_token IS NOT NULL;

-- 6. Add setup_complexity to companies table (for beginner/intermediate/advanced modes)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'companies' AND column_name = 'setup_complexity'
  ) THEN
    ALTER TABLE companies ADD COLUMN setup_complexity TEXT DEFAULT 'beginner' CHECK (setup_complexity IN ('beginner', 'intermediate', 'advanced'));
  END IF;
END $$;

-- 7. Add strategy_completed flag to companies table
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'companies' AND column_name = 'strategy_completed'
  ) THEN
    ALTER TABLE companies ADD COLUMN strategy_completed BOOLEAN DEFAULT false;
  END IF;
END $$;

-- 8. RLS policies (match existing pattern -- service role bypasses, authenticated users see own company)
DO $$ BEGIN
  -- Enable RLS on new tables
  ALTER TABLE strategy_sessions ENABLE ROW LEVEL SECURITY;
  ALTER TABLE strategy_audiences ENABLE ROW LEVEL SECURITY;
  ALTER TABLE strategy_positioning ENABLE ROW LEVEL SECURITY;
  ALTER TABLE strategy_narrative_arcs ENABLE ROW LEVEL SECURITY;
  ALTER TABLE strategy_documents ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Allow authenticated users to read/write their own company's strategy data
DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can manage own company strategy sessions" ON strategy_sessions;
  CREATE POLICY "Users can manage own company strategy sessions" ON strategy_sessions
    FOR ALL USING (
      company_id IN (SELECT company_id FROM user_profiles WHERE id = auth.uid())
      OR EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'admin')
    );

  DROP POLICY IF EXISTS "Users can manage own company strategy audiences" ON strategy_audiences;
  CREATE POLICY "Users can manage own company strategy audiences" ON strategy_audiences
    FOR ALL USING (
      company_id IN (SELECT company_id FROM user_profiles WHERE id = auth.uid())
      OR EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'admin')
    );

  DROP POLICY IF EXISTS "Users can manage own company strategy positioning" ON strategy_positioning;
  CREATE POLICY "Users can manage own company strategy positioning" ON strategy_positioning
    FOR ALL USING (
      company_id IN (SELECT company_id FROM user_profiles WHERE id = auth.uid())
      OR EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'admin')
    );

  DROP POLICY IF EXISTS "Users can manage own company narrative arcs" ON strategy_narrative_arcs;
  CREATE POLICY "Users can manage own company narrative arcs" ON strategy_narrative_arcs
    FOR ALL USING (
      company_id IN (SELECT company_id FROM user_profiles WHERE id = auth.uid())
      OR EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'admin')
    );

  DROP POLICY IF EXISTS "Users can manage own company strategy documents" ON strategy_documents;
  CREATE POLICY "Users can manage own company strategy documents" ON strategy_documents
    FOR ALL USING (
      company_id IN (SELECT company_id FROM user_profiles WHERE id = auth.uid())
      OR EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'admin')
    );

  -- Public read for shared strategy documents (via share_token)
  DROP POLICY IF EXISTS "Anyone can read shared strategy documents" ON strategy_documents;
  CREATE POLICY "Anyone can read shared strategy documents" ON strategy_documents
    FOR SELECT USING (share_token IS NOT NULL);
END $$;
