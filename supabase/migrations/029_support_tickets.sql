-- 029: Support tickets for issue reporting
CREATE TABLE IF NOT EXISTS support_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) ON DELETE SET NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reporter_name TEXT,
  reporter_email TEXT,

  -- Issue details
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT DEFAULT 'bug' CHECK (category IN ('bug', 'feature_request', 'question', 'other')),
  priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  status TEXT DEFAULT 'open' CHECK (status IN ('open', 'investigating', 'in_progress', 'resolved', 'closed', 'wont_fix')),

  -- Auto-captured context
  page_url TEXT,
  browser_info TEXT,
  screen_size TEXT,
  error_message TEXT,
  console_errors TEXT,

  -- Resolution
  resolution_notes TEXT,
  resolved_at TIMESTAMPTZ,
  resolved_by TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON support_tickets(status);
CREATE INDEX IF NOT EXISTS idx_support_tickets_company ON support_tickets(company_id);

-- RLS
ALTER TABLE support_tickets ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can create and view own tickets" ON support_tickets;
  CREATE POLICY "Users can create and view own tickets" ON support_tickets
    FOR ALL USING (
      user_id = auth.uid()
      OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
    );
END $$;
