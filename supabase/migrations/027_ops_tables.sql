-- =============================================================================
-- 027: Operations Tables (replaces Monday.com boards)
-- Pipeline, Production, Invoicing, Prospecting, Tasks + Activity Log
-- =============================================================================

-- ── Pipeline Stages ─────────────────────────────────────────────────────────

CREATE TABLE pipeline_stages (
  name text PRIMARY KEY,
  sort_order int NOT NULL,
  document_type text,        -- e.g. 'proposal', 'scoping', 'sow'
  template_path text,
  runner text                -- 'node' or 'python3'
);

INSERT INTO pipeline_stages (name, sort_order, document_type, template_path, runner) VALUES
  ('New Lead',       1,  NULL,       NULL, NULL),
  ('Qualification',  2,  NULL,       NULL, NULL),
  ('Due Diligence',  3,  NULL,       NULL, NULL),
  ('Brief',          4,  NULL,       NULL, NULL),
  ('Proposal',       5,  'proposal', 'templates/proposal.js', 'node'),
  ('Feedback',       6,  NULL,       NULL, NULL),
  ('Scoping',        7,  'scoping',  'templates/scoping-document.js', 'node'),
  ('Job Costing',    8,  'jcs',      'scripts/jcs-generator.py', 'python3'),
  ('Quotation',      9,  NULL,       NULL, NULL),
  ('PO Awaited',     10, NULL,       NULL, NULL),
  ('SOW',            11, 'sow',      'templates/statement-of-work.js', 'node'),
  ('Onboarding',     12, NULL,       NULL, NULL),
  ('Project Setup',  13, NULL,       NULL, NULL),
  ('Handed to Ops',  14, NULL,       NULL, NULL),
  ('On Hold',        15, NULL,       NULL, NULL),
  ('Lost',           16, NULL,       NULL, NULL),
  ('Won Archive',    17, NULL,       NULL, NULL);

-- ── Pipeline Stage Gates ────────────────────────────────────────────────────

CREATE TABLE pipeline_stage_gates (
  stage text PRIMARY KEY REFERENCES pipeline_stages(name),
  required_fields text[] NOT NULL DEFAULT '{}',
  recommended_fields text[] NOT NULL DEFAULT '{}',
  on_entry_actions text[] NOT NULL DEFAULT '{}',
  auto_fill jsonb DEFAULT '{}',
  stale_days int
);

INSERT INTO pipeline_stage_gates (stage, required_fields, recommended_fields, on_entry_actions, auto_fill, stale_days) VALUES
  ('New Lead',      '{}', '{"contact_name","contact_email"}', '{}', '{}', NULL),
  ('Qualification', '{"contact_name","contact_email"}', '{"area_of_interest","product_interest"}', '{}', '{}', NULL),
  ('Due Diligence', '{"contact_name","contact_email","area_of_interest","product_interest","client_type","owner"}', '{"deal_value","notes"}', '{"research_client"}', '{}', NULL),
  ('Brief',         '{"contact_name","contact_email","area_of_interest","product_interest","client_type","deal_value","owner"}', '{"close_date","notes"}', '{"check_fathom_notes"}', '{}', NULL),
  ('Proposal',      '{"contact_name","contact_email","area_of_interest","product_interest","client_type","deal_value","owner","notes"}', '{"close_date"}', '{"generate_proposal"}', '{}', NULL),
  ('Feedback',      '{"contact_name","contact_email","deal_value","owner"}', '{}', '{"set_chase_timer"}', '{}', 5),
  ('Scoping',       '{"contact_name","contact_email","deal_value","product_interest","owner","notes"}', '{"close_date"}', '{"generate_scoping"}', '{}', NULL),
  ('Job Costing',   '{"contact_name","contact_email","deal_value","product_interest","owner"}', '{}', '{"generate_jcs"}', '{}', NULL),
  ('Quotation',     '{"contact_name","contact_email","deal_value","product_interest","owner","close_date"}', '{}', '{}', '{}', NULL),
  ('PO Awaited',    '{"contact_name","contact_email","deal_value","owner","close_date"}', '{}', '{"set_chase_timer"}', '{}', 7),
  ('SOW',           '{"contact_name","contact_email","deal_value","product_interest","owner","close_date"}', '{"po_number"}', '{"generate_sow"}', '{}', NULL),
  ('Onboarding',    '{"contact_name","contact_email","deal_value","product_interest","owner","close_date","po_number"}', '{}', '{"allocate_job_number","create_drive_folders","go_project_checklist"}', '{"job_number": "wip_counter"}', NULL),
  ('Project Setup', '{"contact_name","contact_email","deal_value","product_interest","owner","close_date","po_number","job_number"}', '{}', '{"generate_project_setup","draft_kickoff_email"}', '{}', NULL),
  ('Handed to Ops', '{"contact_name","contact_email","deal_value","product_interest","owner","close_date","po_number","job_number"}', '{}', '{"post_handoff_summary","create_production_card"}', '{}', NULL),
  ('On Hold',       '{}', '{}', '{}', '{}', NULL),
  ('Lost',          '{}', '{}', '{}', '{}', NULL),
  ('Won Archive',   '{}', '{}', '{}', '{}', NULL);

-- ── Pipeline Deals ──────────────────────────────────────────────────────────

CREATE TABLE pipeline_deals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  monday_id text,                -- preserved for migration traceability
  name text NOT NULL,
  stage text NOT NULL DEFAULT 'New Lead' REFERENCES pipeline_stages(name),
  contact_name text,
  contact_email text,
  area_of_interest text,
  product_interest text,
  client_type text CHECK (client_type IN ('Existing Client', 'New Client', 'Returning Client') OR client_type IS NULL),
  deal_value numeric,
  close_date date,
  job_number text UNIQUE,
  po_number text,
  deal_source text,
  notes text,
  owner text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_deals_stage ON pipeline_deals(stage);
CREATE INDEX idx_deals_job_number ON pipeline_deals(job_number);
CREATE INDEX idx_deals_contact_email ON pipeline_deals(contact_email);

-- ── Production Items ────────────────────────────────────────────────────────

CREATE TABLE production_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  monday_id text,
  name text NOT NULL,
  deal_id uuid REFERENCES pipeline_deals(id),
  client text,
  job_number text,
  deliverable_type text,
  production_status text NOT NULL DEFAULT 'Not Started'
    CHECK (production_status IN ('Briefed', 'Not Started', 'In Production', 'Internal Review', 'Client Review', 'Delivered', 'Completed')),
  production_group text
    CHECK (production_group IN ('Strategy & Planning', 'Creative & Copy', 'Design & Production', 'Digital Marketing', 'Completed') OR production_group IS NULL),
  owner text,
  timeline_start date,
  timeline_end date,
  deadline date,
  priority text CHECK (priority IN ('Critical', 'High', 'Normal', 'Low') OR priority IS NULL),
  charge_out_rate numeric DEFAULT 82,
  cost_rate numeric,
  hours_estimated numeric,
  hours_spent numeric DEFAULT 0,
  files text,           -- URLs, comma-separated (from Monday.com migration)
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_production_job_number ON production_items(job_number);
CREATE INDEX idx_production_status ON production_items(production_status);
CREATE INDEX idx_production_deal_id ON production_items(deal_id);

-- ── Invoices ────────────────────────────────────────────────────────────────

CREATE TABLE invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  monday_id text,
  name text NOT NULL,
  invoice_number text UNIQUE,    -- format: INV-2026-001
  deal_id uuid REFERENCES pipeline_deals(id),
  job_number text,
  client text,
  contact_email text,
  deal_value numeric,
  invoice_amount numeric,
  milestone text CHECK (milestone IN ('40% Deposit', '40% Midpoint', '20% Completion', 'Full') OR milestone IS NULL),
  invoice_status text NOT NULL DEFAULT 'Pending'
    CHECK (invoice_status IN ('Pending', 'Sent', 'Paid', 'Overdue', 'Disputed')),
  invoice_date date,
  due_date date,
  chase_log jsonb DEFAULT '[]'::jsonb,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_invoices_number ON invoices(invoice_number);
CREATE INDEX idx_invoices_job_number ON invoices(job_number);
CREATE INDEX idx_invoices_status ON invoices(invoice_status);
CREATE INDEX idx_invoices_due_date ON invoices(due_date);

-- ── Prospecting Leads ───────────────────────────────────────────────────────

CREATE TABLE prospecting_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  monday_id text,
  name text NOT NULL,
  email text,
  title text,
  company text,
  linkedin_url text,
  stage text NOT NULL DEFAULT 'Identify'
    CHECK (stage IN ('Identify', 'Research', 'Outreach', 'Engage', 'Meeting Booked', 'Parked', 'Moved to Pipeline')),
  pq_score int CHECK (pq_score >= 0 AND pq_score <= 100),
  pq_signals jsonb,
  icp_category text,
  easy_yes text,
  next_action_date date,
  touch_count int DEFAULT 0,
  pipeline_deal_id uuid REFERENCES pipeline_deals(id),
  fathom_notes text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_prospects_stage ON prospecting_leads(stage);
CREATE INDEX idx_prospects_score ON prospecting_leads(pq_score);
CREATE INDEX idx_prospects_next_action ON prospecting_leads(next_action_date);

-- ── MCT Tasks ───────────────────────────────────────────────────────────────

CREATE TABLE mct_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  monday_id text,
  title text NOT NULL,
  status text NOT NULL DEFAULT 'To Do'
    CHECK (status IN ('To Do', 'Doing', 'Done', 'Stuck', 'Waiting On')),
  due_date date,
  priority text CHECK (priority IN ('Critical', 'High', 'Normal', 'Low') OR priority IS NULL),
  category text,
  effort text CHECK (effort IN ('Quick Win', 'Standard', 'Deep Work') OR effort IS NULL),
  related_deal_id uuid REFERENCES pipeline_deals(id),
  related_production_id uuid REFERENCES production_items(id),
  related_link text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_tasks_status ON mct_tasks(status);
CREATE INDEX idx_tasks_due_date ON mct_tasks(due_date);

-- ── Activity Log ────────────────────────────────────────────────────────────

CREATE TABLE activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL CHECK (entity_type IN ('deal', 'production', 'invoice', 'prospect', 'task')),
  entity_id uuid NOT NULL,
  action text NOT NULL CHECK (action IN ('created', 'updated', 'stage_changed', 'note_added', 'deleted')),
  old_value jsonb,
  new_value jsonb,
  actor text DEFAULT 'michael',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_activity_entity ON activity_log(entity_type, entity_id);
CREATE INDEX idx_activity_created ON activity_log(created_at);

-- ── Auto-update timestamps ──────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_deals_updated BEFORE UPDATE ON pipeline_deals
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_production_updated BEFORE UPDATE ON production_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_invoices_updated BEFORE UPDATE ON invoices
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_prospects_updated BEFORE UPDATE ON prospecting_leads
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_tasks_updated BEFORE UPDATE ON mct_tasks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── RLS (single-user, service role key) ─────────────────────────────────────

ALTER TABLE pipeline_deals ENABLE ROW LEVEL SECURITY;
ALTER TABLE production_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE prospecting_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE mct_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE pipeline_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE pipeline_stage_gates ENABLE ROW LEVEL SECURITY;

-- Allow service role full access (API routes use service role key)
CREATE POLICY "service_role_all" ON pipeline_deals FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON production_items FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON invoices FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON prospecting_leads FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON mct_tasks FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON activity_log FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON pipeline_stages FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON pipeline_stage_gates FOR ALL USING (true) WITH CHECK (true);

-- Allow authenticated users (for the Next.js UI)
CREATE POLICY "authenticated_all" ON pipeline_deals FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all" ON production_items FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all" ON invoices FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all" ON prospecting_leads FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all" ON mct_tasks FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all" ON activity_log FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all" ON pipeline_stages FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all" ON pipeline_stage_gates FOR ALL TO authenticated USING (true) WITH CHECK (true);
