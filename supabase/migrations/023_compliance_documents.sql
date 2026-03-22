-- ============================================================
-- 023: Compliance Documents
-- ============================================================
-- Stores uploaded regulatory guardrail documents:
-- - Claims matrix (what can/cannot be said about products)
-- - Messaging house (approved language and positioning)
-- - Brand guidelines (tone, terminology, visual standards)
-- - Custom regulatory docs (company-specific compliance rules)
--
-- These are referenced during compliance reviews to check content
-- against company-specific approved language.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.company_compliance_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,

  -- Document metadata
  name text NOT NULL,
  description text,
  category text NOT NULL CHECK (category IN (
    'claims_matrix',
    'messaging_house',
    'brand_guidelines',
    'regulatory_policy',
    'product_information',
    'custom'
  )),

  -- Storage
  file_url text NOT NULL,
  file_name text NOT NULL,
  file_size_bytes integer,
  mime_type text,

  -- Extracted content (for AI review context)
  extracted_text text,
  extraction_status text DEFAULT 'pending' CHECK (extraction_status IN ('pending', 'processing', 'complete', 'failed')),

  -- Usage
  is_active boolean NOT NULL DEFAULT true,
  use_in_reviews boolean NOT NULL DEFAULT true,

  -- Timestamps
  uploaded_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_compliance_docs_company
  ON public.company_compliance_documents(company_id);

CREATE INDEX IF NOT EXISTS idx_compliance_docs_active
  ON public.company_compliance_documents(company_id, is_active, use_in_reviews)
  WHERE is_active = true AND use_in_reviews = true;

ALTER TABLE public.company_compliance_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin manages compliance docs" ON public.company_compliance_documents;
CREATE POLICY "Admin manages compliance docs" ON public.company_compliance_documents
  FOR ALL USING (public.get_user_role() = 'admin');

DROP POLICY IF EXISTS "Client reads own compliance docs" ON public.company_compliance_documents;
CREATE POLICY "Client reads own compliance docs" ON public.company_compliance_documents
  FOR SELECT USING (company_id = public.get_user_company_id());

DROP POLICY IF EXISTS "Client uploads own compliance docs" ON public.company_compliance_documents;
CREATE POLICY "Client uploads own compliance docs" ON public.company_compliance_documents
  FOR INSERT WITH CHECK (company_id = public.get_user_company_id());
