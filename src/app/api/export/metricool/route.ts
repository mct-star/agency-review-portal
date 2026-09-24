import { NextResponse } from "next/server";
import { requireAdmin, createAdminSupabaseClient } from "@/lib/supabase/admin";
import type { ContentPiece, ContentImage } from "@/types/database";
import { postDateFor } from "@/lib/export/post-date";
import { toLinkedInText } from "@/lib/linkedin/post-text";
import { resolvePieceMedia, type MediaSourceAsset } from "@/lib/content/piece-media";

/**
 * GET /api/export/metricool?weekId=uuid&draft=false
 *
 * Exports an approved week as an 88-column Metricool CSV.
 *
 * Metricool CSV columns (88 total — see atom 12_METRICOOL_CSV.md):
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

const METRICOOL_HEADERS = [
  "Text",
  "Date",
  "Time",
  "Draft",
  "Facebook",
  "Twitter/X",
  "LinkedIn",
  "GBP",
  "Instagram",
  "Pinterest",
  "TikTok",
  "Youtube",
  "Threads",
  "Bluesky",
  "Picture Url 1",
  "Picture Url 2",
  "Picture Url 3",
  "Picture Url 4",
  "Picture Url 5",
  "Picture Url 6",
  "Picture Url 7",
  "Picture Url 8",
  "Picture Url 9",
  "Picture Url 10",
  "Alt text picture 1",
  "Alt text picture 2",
  "Alt text picture 3",
  "Alt text picture 4",
  "Alt text picture 5",
  "Alt text picture 6",
  "Alt text picture 7",
  "Alt text picture 8",
  "Alt text picture 9",
  "Alt text picture 10",
  "Document title",
  "Shortener",
  "Video Thumbnail Url",
  "Video Cover Frame",
  "Twitter/X Can reply",
  "Twitter/X Type",
  "Twitter/X Poll Duration minutes",
  "Twitter/X Poll Option 1",
  "Twitter/X Poll Option 2",
  "Twitter/X Poll Option 3",
  "Twitter/X Poll Option 4",
  "Pinterest Board",
  "Pinterest Pin Title",
  "Pinterest Pin Link",
  "Pinterest Pin New Format",
  "Instagram Post Type",
  "Instagram Show Reel On Feed",
  "Youtube Video Title",
  "Youtube Video Type",
  "Youtube Video Privacy",
  "Youtube video for kids",
  "Youtube Video Category",
  "Youtube Video Tags",
  "Youtube playlist",
  "GBP Post Type",
  "Facebook Post Type",
  "Facebook Title",
  "First Comment Text",
  "TikTok Title",
  "TikTok disable comments",
  "TikTok disable duet",
  "TikTok disable stitch",
  "TikTok Post Privacy",
  "TikTok Branded Content",
  "TikTok Your Brand",
  "TikTok Auto Add Music",
  "TikTok Photo Cover Index",
  "TikTok musicId",
  "TikTok title",
  "TikTok author",
  "TikTok startMillis",
  "TikTok durationMillis",
  "TikTok startVideoMillis",
  "LinkedIn Type",
  "LinkedIn Poll Question",
  "LinkedIn Poll Option 1",
  "LinkedIn Poll Option 2",
  "LinkedIn Poll Option 3",
  "LinkedIn Poll Option 4",
  "LinkedIn Poll Duration",
  "LinkedIn Show link preview",
  "LinkedIn Images as Carousel",
  "Threads Reply Control",
  "Brand name",
];

/**
 * Escape a string for CSV: wrap in double-quotes, double any internal quotes.
 * Convert \n to \r\n for Metricool compatibility.
 */
function csvEscape(value: string): string {
  // Ensure CRLF line breaks
  const normalized = value.replace(/\r\n/g, "\n").replace(/\n/g, "\r\n");
  // Wrap in quotes, escape internal quotes
  return `"${normalized.replace(/"/g, '""')}"`;
}

/**
 * Determine if a post should show a link preview (CTA posts) vs an image.
 */
function shouldShowLinkPreview(postType: string | null): boolean {
  // CTA posts (blog_cta, triage_cta) use link previews instead of images
  return postType === "blog_cta" || postType === "triage_cta";
}

/**
 * Determine if images should be displayed as a carousel.
 */
function isCarouselPost(postType: string | null, imageCount: number): boolean {
  // Only carousel if post type explicitly calls for it and has multiple images
  return postType === "tactical" && imageCount > 1;
}


export async function GET(request: Request) {
  const admin = await requireAdmin();
  if (!admin) {
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

  if (weekErr || !week) {
    return NextResponse.json(
      { error: weekErr?.message || "Week not found" },
      { status: 404 }
    );
  }

  // Fetch social posts only (blog articles etc. don't go into Metricool)
  const query = supabase
    .from("content_pieces")
    .select("*")
    .eq("week_id", weekId)
    // Feed posts, including memes and cards; blogs and articles do not go to Metricool.
    .in("content_type", ["social_post", "meme"])
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

  // Build CSV rows
  const csvRows: string[] = [];

  // Header row
  csvRows.push(METRICOOL_HEADERS.map((h) => csvEscape(h)).join(","));

  // Data rows — one per social post
  for (const piece of pieces as ContentPiece[]) {
    // The same media the preview shows, from the same rule.
    const media = resolvePieceMedia(piece, imagesByPiece.get(piece.id) || [], assetsByPiece.get(piece.id) || []);
    const pieceImages = media.items.map((m) => ({ public_url: m.url, archetype: m.alt, filename: m.alt }));
    const row = new Array(88).fill("");

    // Column 0: Text, exactly as the LinkedIn preview shows it
    row[0] = csvEscape(toLinkedInText(piece.markdown_body));

    // Column 1: Date (YYYY-MM-DD): the piece's own date first
    row[1] = postDateFor(piece, week.date_start);

    // Column 2: Time (HH:MM:SS)
    const time = piece.scheduled_time
      ? (piece.scheduled_time.length === 5 ? piece.scheduled_time + ":00" : piece.scheduled_time)
      : "08:26:00";
    row[2] = time;

    // Column 3: Draft
    row[3] = isDraft ? "true" : "false";

    // Columns 4-13: Platform flags (LinkedIn only)
    row[4] = "false";   // Facebook
    row[5] = "false";   // Twitter/X
    row[6] = "true";    // LinkedIn
    row[7] = "false";   // GBP
    row[8] = "false";   // Instagram
    row[9] = "false";   // Pinterest
    row[10] = "false";  // TikTok
    row[11] = "false";  // Youtube
    row[12] = "false";  // Threads
    row[13] = "false";  // Bluesky

    // Columns 14-23: Picture URLs (up to 10)
    for (let i = 0; i < Math.min(pieceImages.length, 10); i++) {
      row[14 + i] = pieceImages[i].public_url || "";
    }

    // Columns 24-33: Alt text (use filename as fallback)
    for (let i = 0; i < Math.min(pieceImages.length, 10); i++) {
      row[24 + i] = pieceImages[i].archetype || pieceImages[i].filename || "";
    }

    // Column 61: First Comment Text
    if (piece.first_comment) {
      row[61] = csvEscape(toLinkedInText(piece.first_comment));
    }

    // Column 77: LinkedIn Type
    row[77] = "POST";

    // Column 84: LinkedIn Show link preview
    row[84] = shouldShowLinkPreview(piece.post_type) ? "true" : "false";

    // Column 85: LinkedIn Images as Carousel
    row[85] = isCarouselPost(piece.post_type, pieceImages.length) ? "true" : "false";

    csvRows.push(row.join(","));
  }

  // Join with CRLF as per Metricool spec
  const csvContent = csvRows.join("\r\n");

  // Build filename
  const companySlug = (week.company as { slug?: string })?.slug || "export";
  const filename = `metricool_week${week.week_number}_${companySlug}${isDraft ? "_DRAFT" : ""}.csv`;

  return new Response(csvContent, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
