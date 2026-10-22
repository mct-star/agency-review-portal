import { NextResponse } from "next/server";
import { createAdminSupabaseClient, getSignedInProfile } from "@/lib/supabase/admin";
import { canAccessCompany } from "@/lib/auth/permissions";
import type { ContentPiece, ContentImage } from "@/types/database";
import { resolvePieceMedia, type MediaSourceAsset } from "@/lib/content/piece-media";
import { METRICOOL_HEADERS, buildMetricoolRow, csvLine } from "@/lib/export/metricool-row";

/**
 * GET /api/export/metricool?weekId=uuid&draft=false
 *
 * Exports an approved week as an 88-column Metricool CSV.
 *
 * Metricool CSV columns (88 total, see atom 12_METRICOOL_CSV.md):
 * 0  Text
 * 1  Date                    (YYYY-MM-DD)
 * 2  Time                    (HH:MM:SS)
 * 3  Draft                   (true/false)
 * 4  Facebook                (false)
 * 5  Twitter/X               (false)
 * 6  LinkedIn                (true)
 * 7  GBP                     (false)
 * 8  Instagram               (false)
 * 9  Pinterest               (false)
 * 10 TikTok                  (false)
 * 11 Youtube                 (false)
 * 12 Threads                 (false)
 * 13 Bluesky                 (false)
 * 14-23 Picture Url 1–10
 * 24-33 Alt text picture 1–10
 * 34 Document title
 * 35 Shortener
 * 36 Video Thumbnail Url
 * 37 Video Cover Frame
 * 38 Twitter/X Can reply
 * 39 Twitter/X Type
 * 40 Twitter/X Poll Duration minutes
 * 41-44 Twitter/X Poll Option 1–4
 * 45 Pinterest Board
 * 46 Pinterest Pin Title
 * 47 Pinterest Pin Link
 * 48 Pinterest Pin New Format
 * 49 Instagram Post Type
 * 50 Instagram Show Reel On Feed
 * 51 Youtube Video Title
 * 52 Youtube Video Type
 * 53 Youtube Video Privacy
 * 54 Youtube video for kids
 * 55 Youtube Video Category
 * 56 Youtube Video Tags
 * 57 Youtube playlist
 * 58 GBP Post Type
 * 59 Facebook Post Type
 * 60 Facebook Title
 * 61 First Comment Text
 * 62 TikTok Title
 * 63 TikTok disable comments
 * 64 TikTok disable duet
 * 65 TikTok disable stitch
 * 66 TikTok Post Privacy
 * 67 TikTok Branded Content
 * 68 TikTok Your Brand
 * 69 TikTok Auto Add Music
 * 70 TikTok Photo Cover Index
 * 71 TikTok musicId
 * 72 TikTok title
 * 73 TikTok author
 * 74 TikTok startMillis
 * 75 TikTok durationMillis
 * 76 TikTok startVideoMillis
 * 77 LinkedIn Type
 * 78 LinkedIn Poll Question
 * 79-82 LinkedIn Poll Option 1–4
 * 83 LinkedIn Poll Duration
 * 84 LinkedIn Show link preview
 * 85 LinkedIn Images as Carousel
 * 86 Threads Reply Control
 * 87 Brand name
 */

export async function GET(request: Request) {
  const profile = await getSignedInProfile();
  if (!profile) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const weekId = searchParams.get("weekId");
  const isDraft = searchParams.get("draft") === "true";

  if (!weekId) {
    return NextResponse.json({ error: "weekId is required" }, { status: 400 });
  }

  const supabase = await createAdminSupabaseClient();

  // Fetch week data
  const { data: week, error: weekErr } = await supabase
    .from("weeks")
    .select("*, company:companies(*)")
    .eq("id", weekId)
    .single();

  // An admin exports any company's week; a member only their own. Another
  // company's week answers the same as one that does not exist.
  if (weekErr || !week || !canAccessCompany(profile, week.company_id)) {
    return NextResponse.json({ error: "Week not found" }, { status: 404 });
  }

  // Fetch social posts only (blog articles etc. don't go into Metricool)
  const query = supabase
    .from("content_pieces")
    .select("*")
    .eq("week_id", weekId)
    // Feed posts, including memes and cards; blogs and articles do not go to Metricool.
    .in("content_type", ["social_post", "meme"])
    .order("scheduled_date", { ascending: true, nullsFirst: false })
    .order("sort_order", { ascending: true });

  // In non-draft mode, only export approved pieces
  if (!isDraft) {
    query.eq("approval_status", "approved");
  }

  const { data: pieces } = await query;

  if (!pieces || pieces.length === 0) {
    return NextResponse.json(
      { error: "No social posts found for this week" + (isDraft ? "" : " (only approved posts are exported in non-draft mode)") },
      { status: 404 }
    );
  }

  // Fetch images for all pieces
  const pieceIds = pieces.map((p: ContentPiece) => p.id);
  const { data: images } = await supabase
    .from("content_images")
    .select("*")
    .in("content_piece_id", pieceIds)
    .order("sort_order", { ascending: true });

  // Cards and photos the Mac stores as assets or cover images count too.
  const { data: assets } = await supabase
    .from("content_assets")
    .select("content_piece_id, asset_type, file_url, text_content, asset_metadata")
    .in("content_piece_id", pieceIds)
    .not("file_url", "is", null);
  const assetsByPiece = new Map<string, MediaSourceAsset[]>();
  for (const a of (assets || []) as Array<MediaSourceAsset & { content_piece_id: string }>) {
    assetsByPiece.set(a.content_piece_id, [...(assetsByPiece.get(a.content_piece_id) || []), a]);
  }

  const imagesByPiece = new Map<string, ContentImage[]>();
  for (const img of (images || []) as ContentImage[]) {
    const existing = imagesByPiece.get(img.content_piece_id) || [];
    existing.push(img);
    imagesByPiece.set(img.content_piece_id, existing);
  }

  const company = week.company as { slug?: string; social_networks?: string[] | null };

  // Build CSV rows
  const csvRows: string[] = [];
  const notes: string[] = [];
  const defaultedTimes: string[] = [];

  // Header row
  csvRows.push(csvLine(METRICOOL_HEADERS));

  // Data rows, one per social post
  for (const piece of pieces as Array<ContentPiece & { source_meta?: { alt_text?: string } | null; scheduled_date?: string | null }>) {
    // The same media the preview shows, from the same rule.
    const media = resolvePieceMedia(piece, imagesByPiece.get(piece.id) || [], assetsByPiece.get(piece.id) || []);
    const altTexts = media.items.map((m, i) => (i === 0 && piece.source_meta?.alt_text) || m.alt);
    const built = buildMetricoolRow({
      piece,
      weekStart: week.date_start,
      isDraft,
      companyNetworks: company?.social_networks,
      media,
      altTexts,
    });
    notes.push(...built.notes);
    if (built.defaultedTime) defaultedTimes.push(built.defaultedTime);
    csvRows.push(csvLine(built.cells));
  }

  // Posts with no time set take the pipeline default for their kind.
  if (defaultedTimes.length > 0) {
    const kinds = Array.from(new Set(defaultedTimes)).map((t) => t.slice(0, 5)).join(" and ");
    notes.push(`${defaultedTimes.length} ${defaultedTimes.length === 1 ? "post" : "posts"} had no time set, defaulted to ${kinds}`);
  }

  // CRLF between rows, and a byte-order mark first: the Mac pipeline reads UTF-8 with a BOM.
  const csvContent = "\uFEFF" + csvRows.join("\r\n");

  // The portal holds only the personal-feed posts for the platform company
  // (the company page posts never reach it), so its file is named for that brand.
  const companySlug = company?.slug || "export";
  const platformSlug = process.env.PLATFORM_COMPANY_SLUG || "agency-bristol";
  const isPlatformCompany = companySlug === platformSlug;
  if (isPlatformCompany) {
    notes.push("This file is the personal-feed brand only. The company page file comes from the weekly run.");
  }
  const filename = isPlatformCompany
    ? `posts_MCT_week${week.week_number}${isDraft ? "_DRAFT" : ""}.csv`
    : `posts_${companySlug}_week${week.week_number}${isDraft ? "_DRAFT" : ""}.csv`;

  return new Response(csvContent, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      // Plain-words notes for the person exporting (a post with no photo, for example).
      ...(notes.length > 0 ? { "X-Export-Notes": encodeURIComponent(notes.join(" | ")) } : {}),
    },
  });
}
