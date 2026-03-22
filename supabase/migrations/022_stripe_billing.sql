-- ============================================================
-- 022: Stripe Billing Integration
-- ============================================================
-- Adds Stripe-related columns to companies table for
-- subscription management via Stripe Checkout + Webhooks.
-- ============================================================

-- Stripe customer and subscription tracking
ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS stripe_customer_id text,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id text,
  ADD COLUMN IF NOT EXISTS plan_status text DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS plan_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS has_creative_ai_addon boolean DEFAULT false;

-- Index for webhook lookups (find company by Stripe customer)
CREATE INDEX IF NOT EXISTS idx_companies_stripe_customer
  ON companies (stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;

-- Unique constraint on Stripe customer ID (one company per Stripe customer)
CREATE UNIQUE INDEX IF NOT EXISTS idx_companies_stripe_customer_unique
  ON companies (stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;

COMMENT ON COLUMN companies.stripe_customer_id IS 'Stripe Customer ID (cus_xxx)';
COMMENT ON COLUMN companies.stripe_subscription_id IS 'Active Stripe Subscription ID (sub_xxx)';
COMMENT ON COLUMN companies.plan_status IS 'Subscription status: active, past_due, payment_failed, cancelled';
COMMENT ON COLUMN companies.plan_updated_at IS 'When the plan was last changed (by webhook or admin)';
COMMENT ON COLUMN companies.has_creative_ai_addon IS 'Whether the Creative AI add-on ($49/mo) is active';
