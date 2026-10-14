# Migrations

## How they are applied

By hand. Use the Supabase MCP `apply_migration` or the dashboard SQL editor,
and apply a migration before the code that reads it is pushed. Every statement
is `IF NOT EXISTS` (or otherwise idempotent), so a file is safe to re-run.
Nothing runs automatically on deploy.

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
