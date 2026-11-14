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

NOT YET APPLIED (14 November 2026): `20261114100000_capture_grants_and_newsletter_guard.sql`
adds `capture_grants` (the stored side of a phone capture link: company, piece,
expiry, use count, withdrawn flag) and a partial unique index on
`publishing_jobs` so a newsletter article can be marked as published once.
Apply it before merging the code that reads it. Until it exists the code fails
safe: every capture link is refused (503 "not available at the moment") and no
video is stored, the photo staff link is untouched, and "Mark as published"
keeps its existing check, so a double click is only caught by that check
rather than the database. Before applying, run the duplicate check at the top
of the file: if a piece already has two published newsletter jobs, the file
sets the later ones to `cancelled` (nothing is deleted) so the index can be
built. Capture links also need `CAPTURE_LINK_SECRET` set in the environment;
without it they stay off.

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
Vercel variables, come from the unmerged branch `codex/native-content-engine`.
No code on main reads them. Decide whether that branch is merged or the tables
and variables are dropped.
