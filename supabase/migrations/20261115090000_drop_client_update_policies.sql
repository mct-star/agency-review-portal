-- Close two client UPDATE policies that had no column restriction and no
-- WITH CHECK (15 Nov 2026).
--
-- 1. "Client updates approval" on public.content_pieces (001_initial_schema).
--    It let any signed-in client, through the browser Supabase client and
--    the public anon key, update ANY column of any piece in their own
--    company: approval_status, markdown_body, title, schedule, and even
--    company_id (no WITH CHECK). That bypassed /api/content/approve, which
--    writes the append-only content_approvals record before it changes the
--    status, and several publishing routes trust approval_status alone.
--
-- 2. "Client updates variant approval" on public.platform_variants
--    (002_content_operating_system). Same fault: any column of any variant
--    of the company's pieces.
--
-- Nothing in the browser writes either table: every write goes through an
-- API route on the service-role client, which RLS does not apply to and
-- which enforces access itself. A client's approve and request changes go
-- through /api/content/approve; a client's variant approval through PUT
-- /api/variants. Admins keep "Admin manages pieces" and "Admin manages
-- variants"; clients keep their SELECT policies. So the policies are
-- dropped, not narrowed.
--
-- Safe to run twice.

DROP POLICY IF EXISTS "Client updates approval" ON public.content_pieces;
DROP POLICY IF EXISTS "Client updates variant approval" ON public.platform_variants;
