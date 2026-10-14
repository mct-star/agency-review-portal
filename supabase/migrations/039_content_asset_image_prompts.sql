-- Image prompt assets (25 Sept 2026).
--
-- The writer returns image prompts as assets (image_prompt for a social
-- post; cover, hero, header, in-article and infographic prompts for blogs
-- and articles), but the asset_type CHECK did not allow any of them. The
-- routes insert every asset in one batch and did not check the error, so a
-- single prompt sank the batch: every blog lost its SEO title, meta
-- description, URL slug and excerpt too (3 blog pieces, 0 assets, when this
-- was found).

alter table content_assets drop constraint if exists content_assets_asset_type_check;
alter table content_assets add constraint content_assets_asset_type_check check (asset_type in (
  'seo_title', 'seo_meta_description', 'url_slug', 'excerpt', 'categories_tags',
  'featured_image', 'social_share_image', 'in_article_image', 'header_image',
  'personal_distribution_copy', 'company_distribution_copy', 'newsletter_name',
  'pdf_file', 'cover_image', 'page_zone_spec', 'script_text', 'storyboard',
  'intro_outro_spec', 'broll_timestamps', 'subtitle_cues', 'platform_copy', 'custom',
  'image_prompt', 'cover_image_prompt', 'hero_image_prompt', 'header_image_prompt',
  'in_article_image_prompt_1', 'in_article_image_prompt_2', 'in_article_image_prompt_3',
  'infographic_prompt'
));
