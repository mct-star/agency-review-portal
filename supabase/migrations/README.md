# Migrations

## How they are applied

By hand. Use the Supabase MCP `apply_migration` or the dashboard SQL editor,
and apply a migration before the code that reads it is pushed. Every statement
is `IF NOT EXISTS` (or otherwise idempotent), so a file is safe to re-run.
Nothing runs automatically on deploy.

Applied 20 October 2026: `20261018080000_direct_social_oauth_and_pinterest.sql`
adds encrypted, server-only Bluesky authorisation state and permits Pinterest
account identities. Live migration version: `20261020085747`. Verified RLS,
service-role writes, no anon/authenticated access, and all existing platforms retained.

Applied 20 October 2026: `20261020100148_social_network_rollout.sql`
permits YouTube and Pinterest in company network selections while preserving
the eight existing values. Live migration version: `20261020100942`.
Verified the constraint and AGENCY's enabled networks; other companies were unchanged.

NOT YET APPLIED (4 November 2026): `20261104090000_content_approvals.sql`
adds the append-only `content_approvals` table (piece, version hash, decision,
who, when, how). Apply it BEFORE merging the code that writes it: until it
exists, content/approve, review/bulk-approve and the Ops bridge approval
return an error and change nothing, and the Mac's Phase B2 publish holds.

NOT YET APPLIED (12 November 2026): `20261112090000_review_notes.sql`
adds `review_notes` (dictated notes on a piece, each anchored to the
paragraph in view). Apply it before merging the code that reads it: until it
exists, the dictate bar on /content/[pieceId] shows an error and saves nothing.

Applied 15 November 2026: `20261115090000_drop_client_update_policies.sql`
drops the client UPDATE policies "Client updates approval" (content_pieces) and
"Client updates variant approval" (platform_variants). Applied by hand with
Michael's go-ahead and read back: both policies gone. No code depends on them:
every write to either table goes through an API route on the service-role client.

NOT YET APPLIED (15 November 2026): `20261115100000_scope_ecosystem_and_notification_policies.sql`
drops the four "Authenticated users can ... week_ecosystems" policies, leaving
row security on with no policy, and recreates "Admin creates notifications" for
authenticated admins only (its old check ended in `OR true`). No code depends on
the dropped policies: nothing reads or writes week_ecosystems. The two notify
helpers (`src/lib/hospitality/notify.ts`, `src/lib/staff-upload/notify.ts`) insert
on the service-role client; `POST /api/notifications` runs on the caller's own
token, where an admin passes the new check and a client never reaches the insert
(it can see no admin recipients under the users policies). So nothing that
creates a notification today is affected. It can be applied before or after the
code that ships with it. It waits for Michael's go-ahead.

`20261114100000_capture_grants_and_newsletter_guard.sql` was applied on 14 November 2026
under the live name `20261114143915 capture_grants_and_newsletter_guard`. It adds
`capture_grants` and the index `publishing_jobs_newsletter_published_uniq`. Capture links
still refuse until `CAPTURE_LINK_SECRET` is set.

`20261113090000_posting_cadence_and_reminders.sql` was applied on 14 November 2026
under the live name `20261114084142 posting_cadence_and_reminders`. It adds
`company_cadence` and `reminder_log`, read by the hourly reminder job.

`supabase/run_pending_migrations_018_to_022.sql` is an old catch-up script and
stays where it is.

## Numbering notes

- Two files were numbered 024: `024_brand_palette.sql` and
  `024b_trial_email_tracking.sql`.
- `030b_ops_tables.sql` was `027_ops_tables.sql` in the old `_misfiled`
  folder, which clashed with `027_strategy_tables.sql`.
- Files 042 to 044 in this repo (`042_media_library_at_scale`,
  `043_hospitality_pack`, `044_daily_weather_post`) were applied to the live
  database on 14 Oct 2026 under the names `039_media_library_at_scale`,
  `040_hospitality_pack` and `041_daily_weather_post`. Main's own 039 and 040
  are different migrations (`content_asset_image_prompts` and
  `blog_templates_canon`). Do not re-apply any of them.

## Open item for Michael

The live tables `ops_content_operations`, `ops_content_workflows`,
`ops_content_media` and `ops_content_reviews`, and the seven `CONTENT_*`
Vercel variables, came from the branch `codex/native-content-engine`. The
signed Ops bridge on main reads them (`src/lib/ops-content/` and
`/api/ops-content/*`), so do not drop them. Decide whether anything of that
branch is still unmerged.
