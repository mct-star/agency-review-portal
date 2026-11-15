-- Close two row policies that let any signed-in browser session read or
-- write data it should not reach (15 Nov 2026).
--
-- 1. public.week_ecosystems (013_ecosystem_cta_hierarchy). Four policies
--    for role authenticated: SELECT on every row, and INSERT, UPDATE and
--    DELETE for anyone with a company. Any signed-in client, through the
--    browser Supabase client and the public anon key, could read and change
--    every company's ecosystem rows. Nothing in the app reads or writes the
--    table. The four policies are dropped and none is created in their
--    place: row security stays enabled, so with no policy the browser roles
--    get nothing. If a client ever needs this table, it goes through an API
--    route on the service-role client, which checks access itself.
--
-- 2. "Admin creates notifications" on public.notifications
--    (001_initial_schema). Its check was get_user_role() = 'admin' OR true,
--    so it restricted nothing: any signed-in or anonymous caller could insert
--    a notification for any user. The policy is recreated for authenticated
--    admins only. Nothing that creates a notification today is affected:
--    src/lib/hospitality/notify.ts and src/lib/staff-upload/notify.ts insert
--    on the service-role client; POST /api/notifications runs on the
--    caller's own token, where an admin passes the new check and a client
--    never reaches the insert (it can see no admin recipients under the
--    users policies). "Read own notifications" and "Update own notifications" are left
--    alone, and grants are not touched.
--
-- The service role bypasses row security and is unaffected by either change.
--
-- Safe to run twice: every drop is IF EXISTS, and the notifications policy
-- is dropped before it is created.

DROP POLICY IF EXISTS "Authenticated users can select week_ecosystems" ON public.week_ecosystems;
DROP POLICY IF EXISTS "Authenticated users can insert week_ecosystems" ON public.week_ecosystems;
DROP POLICY IF EXISTS "Authenticated users can update week_ecosystems" ON public.week_ecosystems;
DROP POLICY IF EXISTS "Authenticated users can delete week_ecosystems" ON public.week_ecosystems;

DROP POLICY IF EXISTS "Admin creates notifications" ON public.notifications;
CREATE POLICY "Admin creates notifications" ON public.notifications
  FOR INSERT TO authenticated
  WITH CHECK (public.get_user_role() = 'admin');
