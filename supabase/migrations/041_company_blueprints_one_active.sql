-- ============================================================
-- Migration 041: At most one active blueprint per company
-- (1 Oct 2026)
--
-- The generators read a company's blueprint with is_active = true
-- and expect one row (.single() or .maybeSingle()), so a second
-- active row makes that read fail or come back without a
-- blueprint. Nothing in the database prevented one: the strategy
-- markdown import used to insert an active row without
-- deactivating the current one. With this index the database
-- refuses a second active row instead of storing it.
--
-- Run this first. It must return no rows, or the index build
-- fails:
--
--   select company_id, count(*)
--   from public.company_blueprints
--   where is_active
--   group by company_id
--   having count(*) > 1;
--
-- The index is a guard, not an ON CONFLICT target: supabase-js
-- cannot send the predicate a partial index needs. Rows with a
-- null is_active are left out, as they are by every reader.
-- ============================================================

create unique index if not exists company_blueprints_one_active_per_company
  on public.company_blueprints (company_id)
  where is_active;
