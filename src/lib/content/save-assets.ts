/**
 * Turning a generation's assets into content_assets rows, and saving them.
 *
 * Until 25 Sept 2026 each route inserted its assets in one batch and did
 * not check the result. The asset_type CHECK refused the image prompts the
 * writer returns, so the whole batch failed and every blog lost its SEO
 * title, meta description, URL slug and excerpt with it. Migration 039
 * allows the prompt types; this keeps any type the table does not know
 * (a new one the prompt starts returning) as 'custom' with its original
 * name, so one odd asset can never sink the rest again.
 */

type Db = {
  from: (table: string) => { insert: (rows: unknown) => PromiseLike<{ error: { message: string } | null }> };
};

/** The asset_type values content_assets accepts (migration 039). */
export const STORED_ASSET_TYPES = new Set([
  "seo_title", "seo_meta_description", "url_slug", "excerpt", "categories_tags",
  "featured_image", "social_share_image", "in_article_image", "header_image",
  "personal_distribution_copy", "company_distribution_copy", "newsletter_name",
  "pdf_file", "cover_image", "page_zone_spec", "script_text", "storyboard",
  "intro_outro_spec", "broll_timestamps", "subtitle_cues", "platform_copy", "custom",
  "image_prompt", "cover_image_prompt", "hero_image_prompt", "header_image_prompt",
  "in_article_image_prompt_1", "in_article_image_prompt_2", "in_article_image_prompt_3",
  "infographic_prompt",
]);

export interface AssetRow {
  content_piece_id: string;
  asset_type: string;
  text_content: string;
  asset_metadata: Record<string, unknown>;
  sort_order: number;
}

/** Rows for a piece's assets plus its primary image prompt, if the assets do not already carry one. */
export function assetRowsFor(
  pieceId: string,
  assets: Array<{ assetType: string; textContent: string }> | undefined,
  imagePrompt?: string | null,
): AssetRow[] {
  const rows: AssetRow[] = (assets || [])
    .filter(a => a && typeof a.textContent === "string" && a.textContent.trim())
    .map((a, i) => {
      const known = STORED_ASSET_TYPES.has(a.assetType);
      return {
        content_piece_id: pieceId,
        asset_type: known ? a.assetType : "custom",
        text_content: a.textContent,
        asset_metadata: known ? {} : { original_type: a.assetType },
        sort_order: i,
      };
    });
  if (imagePrompt && !rows.some(r => r.asset_type === "image_prompt")) {
    rows.push({ content_piece_id: pieceId, asset_type: "image_prompt", text_content: imagePrompt, asset_metadata: {}, sort_order: rows.length });
  }
  return rows;
}

/** Saves the rows; returns the error message, or null. */
export async function saveAssets(supabase: Db, rows: AssetRow[]): Promise<string | null> {
  if (rows.length === 0) return null;
  const { error } = await supabase.from("content_assets").insert(rows);
  return error ? error.message : null;
}
