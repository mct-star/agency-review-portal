import { NextResponse } from "next/server";
import { requireAdmin, createAdminSupabaseClient } from "@/lib/supabase/admin";

/**
 * GET /api/generate/report/preview?weekId=xxx&companyId=xxx
 *
 * Generates a Post Preview Report as HTML — renders each post as a
 * platform-specific visual preview (LinkedIn, Twitter, Instagram).
 * Designed for client sign-off, print-friendly.
 */

// ── Helpers ─────────────────────────────────────────────────

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const POST_TYPE_LABELS: Record<string, string> = {
  problem_post: "Problem Diagnosis",
  problem_diagnosis: "Problem Diagnosis",
  insight: "Insight Post",
  evidence_proof: "Evidence & Proof",
  contrarian: "Contrarian Take",
  story: "Story Post",
  personal_bridge: "Personal Bridge",
  cta_escalation: "Call to Action",
  engagement: "Engagement Post",
  question: "Question Post",
  listicle: "Listicle",
  how_to: "How-To Post",
  myth_buster: "Myth Buster",
  framework: "Framework Post",
  case_study: "Case Study",
  anchor: "Authority Piece",
  teaser: "Traffic Driver",
  blog_article: "Blog Article",
  linkedin_article: "LinkedIn Article",
  pdf_guide: "PDF Guide",
  video_script: "Video Script",
  social_post: "Social Post",
  blog_cta: "Blog CTA",
  personal: "Personal Post",
};

function getPostTypeLabel(slug: string | null): string {
  if (!slug) return "Social Post";
  return POST_TYPE_LABELS[slug] || slug.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatPostBody(text: string): string {
  // Convert markdown bold to <strong>, escape the rest
  const lines = text.split("\n");
  return lines
    .map((line) => {
      let escaped = escapeHtml(line);
      // Convert **bold** to <strong>
      escaped = escaped.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
      return escaped;
    })
    .join("<br>");
}

function formatTime(timeStr: string | null): string {
  if (!timeStr) return "";
  // timeStr is like "08:26" or "08:26:00"
  const parts = timeStr.split(":");
  if (parts.length < 2) return timeStr;
  const h = parseInt(parts[0]);
  const m = parts[1];
  const ampm = h >= 12 ? "pm" : "am";
  const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${hour12}:${m}${ampm}`;
}

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

interface PieceData {
  id: string;
  title: string;
  body: string;
  first_comment: string | null;
  image_url: string | null;
  post_type: string | null;
  content_type: string;
  day_of_week: string | null;
  scheduled_time: string | null;
  day_name: string;
  day_index: number;
  platform: string;
  word_count: number;
  approval_status: string;
}

// ── Platform preview renderers ──────────────────────────────

function renderLinkedInPreview(
  piece: PieceData,
  authorName: string,
  authorTagline: string,
  profilePictureUrl: string | null,
  brandColor: string,
): string {
  const initials = authorName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const avatarHtml = profilePictureUrl
    ? `<img src="${escapeHtml(profilePictureUrl)}" alt="${escapeHtml(authorName)}" style="width:48px;height:48px;border-radius:50%;object-fit:cover;" />`
    : `<div style="width:48px;height:48px;border-radius:50%;background:${brandColor};color:white;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:14px;">${initials}</div>`;

  const smallAvatarHtml = profilePictureUrl
    ? `<img src="${escapeHtml(profilePictureUrl)}" alt="${escapeHtml(authorName)}" style="width:32px;height:32px;border-radius:50%;object-fit:cover;" />`
    : `<div style="width:32px;height:32px;border-radius:50%;background:${brandColor};color:white;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:11px;">${initials}</div>`;

  const imageHtml = piece.image_url
    ? `<div style="margin-top:12px;"><img src="${escapeHtml(piece.image_url)}" alt="Post image" style="width:100%;max-height:400px;object-fit:cover;" /></div>`
    : `<div style="margin:12px 16px;height:180px;border:2px dashed #e5e7eb;border-radius:8px;background:#f9fafb;display:flex;align-items:center;justify-content:center;color:#9ca3af;font-size:12px;">Image will be generated</div>`;

  const firstCommentHtml = piece.first_comment
    ? `<div style="margin-top:12px;border:1px solid #e5e7eb;border-radius:10px;background:#fff;padding:14px;">
        <div style="display:flex;gap:10px;align-items:flex-start;">
          ${smallAvatarHtml}
          <div style="flex:1;min-width:0;">
            <div style="background:#f3f4f6;border-radius:12px;padding:10px 14px;">
              <div style="display:flex;align-items:center;gap:6px;">
                <span style="font-size:12px;font-weight:600;color:#111;">${escapeHtml(authorName)}</span>
                <span style="font-size:10px;color:#9ca3af;">Author</span>
              </div>
              <p style="margin:6px 0 0;font-size:13px;line-height:1.5;color:#374151;white-space:pre-wrap;">${formatPostBody(piece.first_comment)}</p>
            </div>
            <div style="display:flex;gap:12px;padding:4px 8px;font-size:10px;color:#9ca3af;">
              <span>Just now</span>
              <span style="font-weight:600;">Like</span>
              <span style="font-weight:600;">Reply</span>
            </div>
          </div>
        </div>
      </div>`
    : "";

  return `
    <div style="max-width:555px;margin:0 auto;">
      <div style="border:1px solid #e5e7eb;border-radius:10px;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,0.06);overflow:hidden;">
        <!-- Author -->
        <div style="display:flex;gap:12px;align-items:flex-start;padding:16px 16px 0;">
          ${avatarHtml}
          <div style="flex:1;min-width:0;">
            <div style="display:flex;align-items:center;gap:6px;">
              <span style="font-size:14px;font-weight:600;color:#111;">${escapeHtml(authorName)}</span>
              <span style="border:1px solid #d1d5db;border-radius:2px;padding:0 4px;font-size:10px;font-weight:500;color:#6b7280;">1st</span>
            </div>
            <p style="margin:0;font-size:12px;color:#6b7280;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(authorTagline)}</p>
            <div style="margin-top:2px;font-size:12px;color:#9ca3af;">1d &middot; &#127760;</div>
          </div>
          <div style="color:#9ca3af;font-size:20px;letter-spacing:4px;">&middot;&middot;&middot;</div>
        </div>

        <!-- Body -->
        <div style="padding:12px 16px 4px;font-size:14px;line-height:1.42;color:#111;white-space:pre-wrap;">
          ${formatPostBody(piece.body)}
        </div>

        <!-- Image -->
        ${imageHtml}

        <!-- Reaction counts -->
        <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 16px;border-bottom:1px solid #f3f4f6;">
          <div style="display:flex;align-items:center;gap:2px;">
            <span style="display:inline-flex;width:16px;height:16px;border-radius:50%;background:#3b82f6;align-items:center;justify-content:center;font-size:8px;">&#128077;</span>
            <span style="display:inline-flex;width:16px;height:16px;border-radius:50%;background:#ef4444;align-items:center;justify-content:center;font-size:8px;">&#10084;&#65039;</span>
            <span style="margin-left:4px;font-size:12px;color:#6b7280;">Preview</span>
          </div>
          <span style="font-size:12px;color:#6b7280;">${piece.first_comment ? "1 comment" : "0 comments"}</span>
        </div>

        <!-- Action bar -->
        <div style="display:flex;justify-content:space-around;padding:4px 8px;">
          ${["Like", "Comment", "Repost", "Send"]
            .map(
              (label) =>
                `<div style="display:flex;align-items:center;gap:6px;padding:10px 12px;font-size:12px;font-weight:600;color:#6b7280;">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="#6b7280"><rect width="24" height="24" fill="none"/></svg>
              ${label}
            </div>`,
            )
            .join("")}
        </div>
      </div>

      ${firstCommentHtml}
    </div>`;
}

function renderTwitterPreview(
  piece: PieceData,
  authorName: string,
  profilePictureUrl: string | null,
  brandColor: string,
): string {
  const initials = authorName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const handle = "@" + authorName.toLowerCase().replace(/\s+/g, "");

  const avatarHtml = profilePictureUrl
    ? `<img src="${escapeHtml(profilePictureUrl)}" alt="${escapeHtml(authorName)}" style="width:40px;height:40px;border-radius:50%;object-fit:cover;" />`
    : `<div style="width:40px;height:40px;border-radius:50%;background:${brandColor};color:white;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px;">${initials}</div>`;

  const imageHtml = piece.image_url
    ? `<div style="margin-top:10px;border-radius:16px;overflow:hidden;border:1px solid #e5e7eb;"><img src="${escapeHtml(piece.image_url)}" alt="Post image" style="width:100%;max-height:300px;object-fit:cover;" /></div>`
    : "";

  return `
    <div style="max-width:500px;margin:0 auto;">
      <div style="border:1px solid #e5e7eb;border-radius:16px;background:#fff;padding:16px;box-shadow:0 1px 3px rgba(0,0,0,0.04);">
        <div style="display:flex;gap:10px;">
          ${avatarHtml}
          <div style="flex:1;min-width:0;">
            <div style="display:flex;align-items:center;gap:4px;">
              <span style="font-size:15px;font-weight:700;color:#0f1419;">${escapeHtml(authorName)}</span>
              <span style="font-size:15px;color:#536471;">${escapeHtml(handle)}</span>
              <span style="font-size:15px;color:#536471;">&middot;</span>
              <span style="font-size:15px;color:#536471;">1h</span>
            </div>
            <div style="margin-top:4px;font-size:15px;line-height:1.4;color:#0f1419;white-space:pre-wrap;">${formatPostBody(piece.body)}</div>
            ${imageHtml}
            <!-- Engagement bar -->
            <div style="display:flex;justify-content:space-between;margin-top:12px;max-width:400px;">
              ${["&#128172;", "&#128257;", "&#10084;&#65039;", "&#128202;", "&#128279;"]
                .map(
                  (icon) =>
                    `<span style="font-size:13px;color:#536471;cursor:pointer;">${icon}</span>`,
                )
                .join("")}
            </div>
          </div>
        </div>
      </div>
    </div>`;
}

function renderInstagramPreview(
  piece: PieceData,
  authorName: string,
  profilePictureUrl: string | null,
  brandColor: string,
): string {
  const initials = authorName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const username = authorName.toLowerCase().replace(/\s+/g, "");

  const avatarHtml = profilePictureUrl
    ? `<img src="${escapeHtml(profilePictureUrl)}" alt="${escapeHtml(authorName)}" style="width:32px;height:32px;border-radius:50%;object-fit:cover;" />`
    : `<div style="width:32px;height:32px;border-radius:50%;background:${brandColor};color:white;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:11px;">${initials}</div>`;

  const imageHtml = piece.image_url
    ? `<img src="${escapeHtml(piece.image_url)}" alt="Post image" style="width:100%;aspect-ratio:1/1;object-fit:cover;" />`
    : `<div style="width:100%;aspect-ratio:1/1;background:#f3f4f6;display:flex;align-items:center;justify-content:center;color:#9ca3af;font-size:14px;">Image will be generated</div>`;

  // Truncate caption for Instagram style
  const captionText = piece.body.length > 200 ? piece.body.substring(0, 200) + "... more" : piece.body;

  return `
    <div style="max-width:468px;margin:0 auto;">
      <div style="border:1px solid #e5e7eb;border-radius:8px;background:#fff;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.04);">
        <!-- Header -->
        <div style="display:flex;align-items:center;gap:10px;padding:12px 14px;">
          <div style="border:2px solid transparent;background:linear-gradient(45deg,#f09433,#e6683c,#dc2743,#cc2366,#bc1888);border-radius:50%;padding:2px;">
            ${avatarHtml}
          </div>
          <span style="font-size:14px;font-weight:600;color:#262626;">${escapeHtml(username)}</span>
          <div style="margin-left:auto;color:#262626;font-size:16px;letter-spacing:4px;">&middot;&middot;&middot;</div>
        </div>

        <!-- Image -->
        ${imageHtml}

        <!-- Actions -->
        <div style="display:flex;gap:14px;padding:12px 14px;">
          <span style="font-size:20px;">&#10084;&#65039;</span>
          <span style="font-size:20px;">&#128172;</span>
          <span style="font-size:20px;">&#9993;&#65039;</span>
          <span style="font-size:20px;margin-left:auto;">&#128278;</span>
        </div>

        <!-- Caption -->
        <div style="padding:0 14px 14px;font-size:14px;line-height:1.4;color:#262626;">
          <strong>${escapeHtml(username)}</strong> ${escapeHtml(captionText)}
        </div>
      </div>
    </div>`;
}

// ── Determine platform from content ──────────────────────────

function detectPlatform(piece: { content_type: string; post_type: string | null }): string {
  if (piece.content_type === "blog_article") return "blog";
  if (piece.content_type === "linkedin_article") return "linkedin";
  if (piece.content_type === "pdf_guide") return "pdf";
  if (piece.content_type === "video_script") return "video";
  // Default social posts to LinkedIn
  return "linkedin";
}

// ── Main route handler ──────────────────────────────────────

export async function GET(request: Request) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const weekId = url.searchParams.get("weekId");
  const companyId = url.searchParams.get("companyId");

  if (!weekId || !companyId) {
    return NextResponse.json({ error: "weekId and companyId required" }, { status: 400 });
  }

  const supabase = await createAdminSupabaseClient();

  // Fetch all data in parallel
  const [companyRes, weekRes, piecesRes, spokespersonsRes] = await Promise.all([
    supabase.from("companies").select("*").eq("id", companyId).single(),
    supabase.from("weeks").select("*").eq("id", weekId).single(),
    supabase
      .from("content_pieces")
      .select("*")
      .eq("week_id", weekId)
      .order("sort_order"),
    supabase
      .from("company_spokespersons")
      .select("*")
      .eq("company_id", companyId)
      .eq("is_active", true)
      .order("sort_order"),
  ]);

  const company = companyRes.data;
  const week = weekRes.data;
  const rawPieces = piecesRes.data || [];
  const spokespersons = spokespersonsRes.data || [];

  if (!company || !week) {
    return NextResponse.json({ error: "Company or week not found" }, { status: 404 });
  }

  // Fetch images for all pieces
  const pieceIds = rawPieces.map((p: Record<string, unknown>) => p.id as string);
  const imagesForPieces =
    pieceIds.length > 0
      ? await supabase
          .from("content_images")
          .select("*")
          .in("content_piece_id", pieceIds)
          .order("sort_order")
      : { data: [] };

  const imagesByPiece = new Map<string, string>();
  for (const img of (imagesForPieces.data || []) as Array<{ content_piece_id: string; public_url: string }>) {
    if (!imagesByPiece.has(img.content_piece_id)) {
      imagesByPiece.set(img.content_piece_id, img.public_url);
    }
  }

  // Primary spokesperson (or fall back to company-level)
  const primarySpokesperson = spokespersons.find((s: Record<string, unknown>) => s.is_primary) || spokespersons[0];
  const authorName = primarySpokesperson?.name || company.spokesperson_name || "Author";
  const authorTagline = primarySpokesperson?.tagline || company.spokesperson_tagline || "";
  const profilePictureUrl = primarySpokesperson?.profile_picture_url || company.profile_picture_url || null;

  const brandColor = company.brand_color || "#1e293b";
  const logoUrl = company.logo_url || null;

  // Build piece data
  const pieces: PieceData[] = rawPieces.map((p: Record<string, unknown>) => {
    const dayIndex = p.day_of_week ? parseInt(p.day_of_week as string) : -1;
    const body = (p.markdown_body as string) || "";
    return {
      id: p.id as string,
      title: (p.title as string) || "Untitled",
      body,
      first_comment: (p.first_comment as string) || null,
      image_url: imagesByPiece.get(p.id as string) || null,
      post_type: (p.post_type as string) || null,
      content_type: (p.content_type as string) || "social_post",
      day_of_week: (p.day_of_week as string) || null,
      scheduled_time: (p.scheduled_time as string) || null,
      day_name: dayIndex >= 0 ? DAY_NAMES[dayIndex] : "Unscheduled",
      day_index: dayIndex,
      platform: detectPlatform({ content_type: (p.content_type as string) || "social_post", post_type: (p.post_type as string) || null }),
      word_count: (p.word_count as number) || wordCount(body),
      approval_status: (p.approval_status as string) || "pending",
    };
  });

  // Sort by day then time
  const sortedPieces = [...pieces].sort((a, b) => {
    const dayDiff = (a.day_index === -1 ? 99 : a.day_index) - (b.day_index === -1 ? 99 : b.day_index);
    if (dayDiff !== 0) return dayDiff;
    return (a.scheduled_time || "").localeCompare(b.scheduled_time || "");
  });

  // Group by day
  const dayGroups = new Map<string, PieceData[]>();
  for (const p of sortedPieces) {
    const key = p.day_name;
    const existing = dayGroups.get(key) || [];
    existing.push(p);
    dayGroups.set(key, existing);
  }

  // Date formatting
  const reportDate = new Date().toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const weekLabel = week.date_start
    ? `w/c ${new Date(week.date_start + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "long" })}`
    : `Week ${week.week_number}`;

  // ── Render post previews ──────────────────────────────────

  let postSections = "";
  let postIndex = 0;

  for (const [day, dayPieces] of dayGroups) {
    postSections += `<div class="day-divider"><span>${day}</span></div>`;

    for (const piece of dayPieces) {
      postIndex++;
      const timeStr = formatTime(piece.scheduled_time);
      const typeLabel = getPostTypeLabel(piece.post_type);

      let previewHtml: string;
      if (piece.platform === "twitter") {
        previewHtml = renderTwitterPreview(piece, authorName, profilePictureUrl, brandColor);
      } else if (piece.platform === "instagram") {
        previewHtml = renderInstagramPreview(piece, authorName, profilePictureUrl, brandColor);
      } else {
        previewHtml = renderLinkedInPreview(piece, authorName, authorTagline, profilePictureUrl, brandColor);
      }

      postSections += `
        <div class="post-section">
          <div class="post-meta">
            <span class="post-type-badge" style="background:${brandColor}15;color:${brandColor};border:1px solid ${brandColor}30;">${escapeHtml(typeLabel)}</span>
            <span class="post-schedule">${day} ${timeStr ? "at " + timeStr : ""}</span>
            <span class="post-wordcount">${piece.word_count} words</span>
          </div>
          <h3 class="post-title">${escapeHtml(piece.title)}</h3>
          <div class="preview-container">
            ${previewHtml}
          </div>
        </div>`;
    }
  }

  // ── Sign-off table ────────────────────────────────────────

  const signoffRows = sortedPieces
    .map(
      (p) => `<tr>
        <td class="so-title">${escapeHtml(p.title)}</td>
        <td class="so-platform">${p.platform === "twitter" ? "X / Twitter" : p.platform === "instagram" ? "Instagram" : p.platform === "blog" ? "Blog" : "LinkedIn"}</td>
        <td class="so-check"><div class="checkbox"></div></td>
        <td class="so-comments"></td>
      </tr>`,
    )
    .join("\n");

  // ── Build HTML ────────────────────────────────────────────

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Post Preview Report - ${escapeHtml(company.name)} - ${weekLabel}</title>
  <style>
    @media print {
      body { font-size: 11pt; }
      .no-print { display: none !important; }
      .post-section { page-break-inside: avoid; }
      .signoff-section { page-break-before: always; }
      .header-bar, .day-divider, .post-type-badge {
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif;
      line-height: 1.6;
      color: #1a1a1a;
      max-width: 800px;
      margin: 0 auto;
      padding: 40px 24px;
      background: #f8f9fa;
    }

    /* Toolbar */
    .toolbar {
      margin-bottom: 24px;
      padding: 14px 20px;
      background: #f5f3ff;
      border-radius: 8px;
      display: flex;
      gap: 10px;
      align-items: center;
    }
    .toolbar-btn {
      display: inline-block;
      padding: 9px 20px;
      background: ${brandColor};
      color: white;
      border: none;
      border-radius: 6px;
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
    }
    .toolbar-btn:hover { opacity: 0.9; }
    .toolbar-hint { font-size: 12px; color: #666; }

    /* Header */
    .header-bar {
      background: ${brandColor};
      color: white;
      padding: 28px 32px;
      border-radius: 10px;
      margin-bottom: 8px;
    }
    .header-top {
      display: flex;
      align-items: center;
      gap: 20px;
      margin-bottom: 16px;
    }
    .header-logo {
      width: 52px;
      height: 52px;
      border-radius: 8px;
      object-fit: contain;
      background: rgba(255,255,255,0.15);
      padding: 4px;
      flex-shrink: 0;
    }
    .header-bar h1 {
      font-size: 22px;
      font-weight: 700;
      margin: 0;
      letter-spacing: -0.3px;
    }
    .header-bar .subtitle {
      font-size: 14px;
      color: rgba(255,255,255,0.8);
      margin-top: 2px;
    }
    .header-meta {
      display: flex;
      gap: 24px;
      flex-wrap: wrap;
      font-size: 13px;
      color: rgba(255,255,255,0.75);
      padding-top: 14px;
      border-top: 1px solid rgba(255,255,255,0.2);
    }
    .header-meta strong { color: rgba(255,255,255,0.95); }

    /* Day dividers */
    .day-divider {
      display: flex;
      align-items: center;
      gap: 16px;
      margin: 36px 0 20px;
    }
    .day-divider::before,
    .day-divider::after {
      content: "";
      flex: 1;
      height: 1px;
      background: #d1d5db;
    }
    .day-divider span {
      font-size: 13px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 1.5px;
      color: ${brandColor};
    }

    /* Post sections */
    .post-section {
      background: #fff;
      border-radius: 12px;
      padding: 24px;
      margin-bottom: 24px;
      box-shadow: 0 1px 4px rgba(0,0,0,0.06);
      border: 1px solid #e5e7eb;
    }
    .post-meta {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 10px;
      flex-wrap: wrap;
    }
    .post-type-badge {
      font-size: 11px;
      font-weight: 600;
      padding: 3px 10px;
      border-radius: 20px;
    }
    .post-schedule {
      font-size: 12px;
      color: #6b7280;
    }
    .post-wordcount {
      font-size: 11px;
      color: #9ca3af;
      background: #f3f4f6;
      padding: 2px 8px;
      border-radius: 10px;
    }
    .post-title {
      font-size: 16px;
      font-weight: 600;
      color: #111;
      margin-bottom: 16px;
      letter-spacing: -0.2px;
    }
    .preview-container {
      /* Container for the platform preview */
    }

    /* Sign-off section */
    .signoff-section {
      background: #fff;
      border-radius: 12px;
      padding: 28px;
      margin-top: 40px;
      box-shadow: 0 1px 4px rgba(0,0,0,0.06);
      border: 1px solid #e5e7eb;
    }
    .signoff-section h2 {
      font-size: 18px;
      font-weight: 700;
      color: #111;
      margin-bottom: 16px;
    }
    .signoff-table {
      width: 100%;
      border-collapse: collapse;
      margin: 16px 0 28px;
      font-size: 13px;
    }
    .signoff-table th {
      text-align: left;
      padding: 10px 12px;
      background: #f7f8fa;
      font-weight: 600;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: #555;
      border-bottom: 2px solid #e5e5e5;
    }
    .signoff-table td {
      padding: 10px 12px;
      border-bottom: 1px solid #f0f0f0;
      vertical-align: middle;
    }
    .so-title { font-weight: 500; color: #111; }
    .so-platform { color: #6b7280; font-size: 12px; white-space: nowrap; }
    .so-check { text-align: center; width: 80px; }
    .so-comments { min-width: 180px; }
    .checkbox {
      width: 18px;
      height: 18px;
      border: 2px solid #d1d5db;
      border-radius: 4px;
      margin: 0 auto;
    }

    /* Signature lines */
    .signature-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 32px;
      margin-top: 32px;
      padding-top: 24px;
      border-top: 1px solid #e5e7eb;
    }
    .sig-block {
      padding-bottom: 48px;
      border-bottom: 1px solid #9ca3af;
    }
    .sig-label {
      font-size: 11px;
      color: #6b7280;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-top: 8px;
    }

    .report-footer {
      margin-top: 24px;
      font-size: 11px;
      color: #9ca3af;
      text-align: center;
    }
  </style>
</head>
<body>
  <div class="no-print toolbar">
    <button class="toolbar-btn" onclick="window.print()">Save as PDF</button>
    <span class="toolbar-hint">Use your browser's print dialog to save as PDF</span>
  </div>

  <!-- Header -->
  <div class="header-bar">
    <div class="header-top">
      ${logoUrl ? `<img class="header-logo" src="${escapeHtml(logoUrl)}" alt="${escapeHtml(company.name)} logo" />` : ""}
      <div>
        <h1>${escapeHtml(company.name)}</h1>
        <div class="subtitle">Content Preview &amp; Sign-off Report</div>
      </div>
    </div>
    <div class="header-meta">
      <div><strong>Week:</strong> ${escapeHtml(weekLabel)}</div>
      ${week.theme ? `<div><strong>Theme:</strong> ${escapeHtml(week.theme)}</div>` : ""}
      ${week.subject ? `<div><strong>Subject:</strong> ${escapeHtml(week.subject)}</div>` : ""}
      <div><strong>Generated:</strong> ${reportDate}</div>
    </div>
  </div>

  <!-- Post Previews -->
  ${postSections || '<p style="text-align:center;color:#9ca3af;padding:40px 0;">No content pieces found for this week.</p>'}

  <!-- Sign-off Section -->
  <div class="signoff-section">
    <h2>Sign-off</h2>
    <p style="font-size:14px;color:#6b7280;margin-bottom:16px;">
      Please review each post above and confirm approval below.
    </p>

    <table class="signoff-table">
      <thead>
        <tr>
          <th>Post Title</th>
          <th>Platform</th>
          <th>Approved</th>
          <th>Comments</th>
        </tr>
      </thead>
      <tbody>
        ${signoffRows}
      </tbody>
    </table>

    <div class="signature-grid">
      <div>
        <div class="sig-block"></div>
        <p class="sig-label">Content Approver</p>
      </div>
      <div>
        <div class="sig-block"></div>
        <p class="sig-label">Date</p>
      </div>
      <div>
        <div class="sig-block"></div>
        <p class="sig-label">Regulatory Approver</p>
      </div>
      <div>
        <div class="sig-block"></div>
        <p class="sig-label">Date</p>
      </div>
    </div>
  </div>

  <p class="report-footer">
    Report generated by ${escapeHtml(company.name)} Content Platform. ${reportDate}.
  </p>
</body>
</html>`;

  return new NextResponse(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Disposition": `inline; filename="post-preview-week-${week.week_number}-${company.name.replace(/\s+/g, "-").toLowerCase()}.html"`,
    },
  });
}
