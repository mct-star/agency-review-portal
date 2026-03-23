import { NextResponse } from "next/server";
import { requireAdmin, createAdminSupabaseClient } from "@/lib/supabase/admin";
import { resolveProvider } from "@/lib/providers";

/**
 * GET /api/generate/report?weekId=xxx&companyId=xxx
 *
 * Generates an editorial brief as HTML that a marketing director can hand
 * to their CMO. Opens in a new browser tab — print-friendly.
 *
 * Sections:
 *   1. This Week's Story (AI-generated narrative)
 *   2. The Journey (visual flow of posts through the week)
 *   3. Content at a Glance (clean table)
 *   4. Key Messages (AI-generated takeaways)
 *   5. Approval (sign-off section)
 */

// ── Plain-language role labels ──────────────────────────────
const ROLE_LABELS: Record<string, string> = {
  anchor: "Authority piece",
  teaser: "Traffic driver",
  cta_escalation: "Call to action",
  engagement: "Community builder",
  personal_bridge: "Personal connection",
};

function friendlyRole(role: string): string {
  return ROLE_LABELS[role] || role.replace(/_/g, " ");
}

// ── Day ordering helpers ────────────────────────────────────
const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

interface PieceSummary {
  title: string;
  type: string;
  day: string;
  dayIndex: number;
  time: string;
  ecosystemRole: string;
  wordCount: number;
  markdownBody: string;
  platform: string;
  status: string;
}

function guessPlatform(type: string): string {
  if (type === "blog_article" || type === "linkedin_article") return "Blog / Website";
  if (type === "pdf_guide") return "PDF download";
  if (type === "video_script") return "Video";
  return "LinkedIn";
}

// ── Purpose sentence generator ──────────────────────────────
function purposeSentence(piece: PieceSummary, dayIndex: number, totalPieces: number): string {
  const role = piece.ecosystemRole;
  const isFirst = dayIndex === 0;
  const isLast = dayIndex === totalPieces - 1;

  if (role === "anchor") return "Establishes authority with an in-depth exploration of the week's theme";
  if (role === "teaser" && isFirst) return "Opens the week's theme and drives traffic to the main content";
  if (role === "teaser") return "Builds on the week's narrative and drives readers to the anchor content";
  if (role === "cta_escalation") return "Converts engaged readers with a clear next step";
  if (role === "engagement" && isFirst) return "Opens the week's theme with a provocative question";
  if (role === "engagement") return "Sparks conversation and builds community around the topic";
  if (role === "personal_bridge") return "Adds a personal, human touch to close the week";
  if (isFirst) return "Opens the conversation for the week";
  if (isLast) return "Closes the week with a clear takeaway";
  return "Deepens the week's theme with supporting evidence";
}

// ── Journey step label ──────────────────────────────────────
function journeyVerb(role: string, index: number, total: number): string {
  if (index === 0) return "opens the problem";
  if (role === "anchor") return "builds authority";
  if (role === "teaser") return "drives traffic";
  if (role === "engagement") return "deepens with evidence";
  if (role === "cta_escalation") return "drives to action";
  if (role === "personal_bridge") return "adds a personal touch";
  if (index === total - 1) return "closes the week";
  return "builds the narrative";
}

// ── AI narrative generation ─────────────────────────────────

interface AINarrative {
  weekStory: string;
  keyMessages: string[];
}

async function generateAINarrative(
  companyId: string,
  weekData: { week_number: number; theme?: string; subject?: string; pillar?: string },
  pieces: PieceSummary[],
  companyName: string,
): Promise<AINarrative | null> {
  try {
    const resolved = await resolveProvider(companyId, "content_generation");
    if (!resolved) return null;

    const apiKey = resolved.credentials.api_key as string;
    if (!apiKey) return null;

    const provider = resolved.provider;
    const isAnthropic = provider === "anthropic_claude" || provider.startsWith("anthropic");

    const postSummaries = pieces
      .map((p) => `- ${p.day}: "${p.title}" (${friendlyRole(p.ecosystemRole)})`)
      .join("\n");

    const prompt = `You are writing an editorial brief for a marketing director at ${companyName}.
This is for Week ${weekData.week_number}.
${weekData.theme ? `Theme: ${weekData.theme}` : ""}
${weekData.subject ? `Subject: ${weekData.subject}` : ""}
${weekData.pillar ? `Content pillar: ${weekData.pillar}` : ""}

The posts scheduled this week are:
${postSummaries}

Please provide TWO sections in your response, separated by the marker "---KEY MESSAGES---":

SECTION 1 - "This Week's Story": Write 2-3 paragraphs explaining what story this week's content tells, why it matters to the audience right now, and how the posts build on each other through the week. Write in plain language as if explaining the content strategy to a senior stakeholder. No jargon, no pillar codes, no internal terminology.

---KEY MESSAGES---

SECTION 2 - "Key Messages": Write 3-5 bullet points (each starting with "- ") summarising what the audience should take away from this week's content. Write from the audience's perspective, not the content creator's. Each bullet should be a clear, actionable insight.`;

    if (isAnthropic) {
      const model = (resolved.settings.model as string) || "claude-sonnet-4-20250514";
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model,
          max_tokens: 1500,
          messages: [{ role: "user", content: prompt }],
        }),
      });

      if (!res.ok) return null;

      const data = await res.json();
      const text = data.content?.[0]?.text || "";
      return parseAIResponse(text);
    } else {
      // OpenAI-compatible fallback
      const model = (resolved.settings.model as string) || "gpt-4o";
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          max_tokens: 1500,
          messages: [{ role: "user", content: prompt }],
        }),
      });

      if (!res.ok) return null;

      const data = await res.json();
      const text = data.choices?.[0]?.message?.content || "";
      return parseAIResponse(text);
    }
  } catch {
    return null;
  }
}

function parseAIResponse(text: string): AINarrative {
  const parts = text.split("---KEY MESSAGES---");
  const weekStory = (parts[0] || "").trim();
  const keyMessagesRaw = (parts[1] || "").trim();

  const keyMessages = keyMessagesRaw
    .split("\n")
    .map((line) => line.replace(/^[-*]\s*/, "").trim())
    .filter((line) => line.length > 0);

  return { weekStory, keyMessages };
}

// ── HTML helpers ────────────────────────────────────────────

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
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
  const [companyRes, weekRes, piecesRes] = await Promise.all([
    supabase.from("companies").select("*").eq("id", companyId).single(),
    supabase.from("weeks").select("*").eq("id", weekId).single(),
    supabase
      .from("content_pieces")
      .select("*")
      .eq("week_id", weekId)
      .order("sort_order"),
  ]);

  const company = companyRes.data;
  const week = weekRes.data;
  const pieces = piecesRes.data || [];

  if (!company || !week) {
    return NextResponse.json({ error: "Company or week not found" }, { status: 404 });
  }

  // Build piece summaries
  const pieceSummaries: PieceSummary[] = pieces.map((p) => {
    const dayIndex = p.day_of_week ? parseInt(p.day_of_week) : -1;
    return {
      title: p.title || "Untitled",
      type: p.post_type || p.content_type || "social_post",
      day: dayIndex >= 0 ? DAY_NAMES[dayIndex] : "Unscheduled",
      dayIndex,
      time: p.scheduled_time || "",
      ecosystemRole: p.ecosystem_role || "general",
      wordCount: p.word_count || 0,
      markdownBody: p.markdown_body || "",
      platform: guessPlatform(p.post_type || p.content_type || "social_post"),
      status: p.approval_status || "pending",
    };
  });

  // Sort by day then time
  const sortedPieces = [...pieceSummaries].sort((a, b) => {
    const dayDiff = (a.dayIndex === -1 ? 99 : a.dayIndex) - (b.dayIndex === -1 ? 99 : b.dayIndex);
    if (dayDiff !== 0) return dayDiff;
    return (a.time || "").localeCompare(b.time || "");
  });

  // Generate AI narrative (gracefully degrades if no API key)
  const aiNarrative = await generateAINarrative(
    companyId,
    { week_number: week.week_number, theme: week.theme, subject: week.subject, pillar: week.pillar },
    sortedPieces,
    company.name,
  );

  // Date formatting
  const reportDate = new Date().toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const weekDateRange =
    week.date_start && week.date_end
      ? `${new Date(week.date_start).toLocaleDateString("en-GB", { day: "numeric", month: "short" })} – ${new Date(week.date_end).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`
      : `Week ${week.week_number}`;

  const brandColor = company.brand_color || "#1e293b";
  const logoUrl = company.logo_url || null;

  // Group pieces by day for the journey section
  const dayGroups: Map<string, PieceSummary[]> = new Map();
  for (const p of sortedPieces) {
    if (p.day === "Unscheduled") continue;
    const existing = dayGroups.get(p.day) || [];
    existing.push(p);
    dayGroups.set(p.day, existing);
  }

  // Build journey steps
  const journeySteps = Array.from(dayGroups.entries()).map(([day, dayPieces], idx, arr) => ({
    day,
    titles: dayPieces.map((p) => p.title),
    purpose: journeyVerb(dayPieces[0].ecosystemRole, idx, arr.length),
    isLast: idx === arr.length - 1,
  }));

  // ── Build HTML ──────────────────────────────────────────────

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Editorial Brief – ${escapeHtml(company.name)} – ${weekDateRange}</title>
  <style>
    @media print {
      body { font-size: 11pt; }
      .no-print { display: none !important; }
      .page-break { page-break-before: always; }
      .header-card { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .journey-container { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif;
      line-height: 1.7;
      color: #1a1a1a;
      max-width: 820px;
      margin: 0 auto;
      padding: 40px 24px;
      background: #fff;
    }

    /* Header card */
    .header-card {
      border-radius: 12px;
      border: 1px solid #e5e7eb;
      background: #fff;
      box-shadow: 0 1px 2px rgba(0,0,0,0.05);
      overflow: hidden;
      margin-bottom: 32px;
    }
    .header-brand-bar {
      height: 6px;
      border-radius: 12px 12px 0 0;
    }
    .header-inner {
      padding: 24px;
    }
    .header-logos {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 20px;
    }
    .agency-logo {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .agency-logo-text {
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.15em;
      color: #111827;
      font-family: system-ui, sans-serif;
    }
    .agency-logo-sub {
      font-size: 9px;
      color: #9ca3af;
      letter-spacing: 0.08em;
    }
    .client-logo {
      height: 32px;
      object-fit: contain;
    }
    .client-name-text {
      font-size: 14px;
      font-weight: 600;
      color: #374151;
    }
    .header-divider {
      border: none;
      border-top: 1px solid #f3f4f6;
      margin: 0;
    }
    .header-title-area {
      padding-top: 16px;
    }
    .header-title-row {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 4px;
    }
    .header-title-row h1 {
      font-size: 18px;
      font-weight: 700;
      color: #111827;
    }
    .header-title-row svg {
      width: 20px;
      height: 20px;
      color: #475569;
      flex-shrink: 0;
    }
    .header-date-subtitle {
      font-size: 14px;
      color: #6b7280;
      margin-top: 2px;
    }

    /* Meta grid */
    .meta-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 16px 32px;
      margin-top: 16px;
      font-size: 12px;
    }
    .meta-grid-label {
      font-size: 10px;
      color: #9ca3af;
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }
    .meta-grid-value {
      font-weight: 500;
      color: #374151;
      margin-top: 2px;
    }

    /* Section headings */
    h2 {
      font-size: 17px;
      font-weight: 700;
      color: #111;
      margin-top: 40px;
      margin-bottom: 16px;
      letter-spacing: -0.2px;
    }
    h2 .section-number {
      display: inline-block;
      width: 28px;
      height: 28px;
      border-radius: 50%;
      background: #0f172a;
      color: white;
      font-size: 13px;
      font-weight: 700;
      text-align: center;
      line-height: 28px;
      margin-right: 10px;
      vertical-align: middle;
    }

    /* Story section */
    .story-section {
      background: #fafbfc;
      border-radius: 10px;
      padding: 24px 28px;
      margin-bottom: 8px;
      border-left: 2px solid ${brandColor};
    }
    .story-section p {
      font-size: 14px;
      line-height: 1.75;
      color: #333;
      margin-bottom: 14px;
    }
    .story-section p:last-child {
      margin-bottom: 0;
    }
    .story-fallback {
      font-size: 14px;
      color: #666;
      font-style: italic;
    }

    /* Journey section */
    .journey-container {
      display: flex;
      align-items: flex-start;
      gap: 0;
      margin: 20px 0;
      overflow-x: auto;
      padding-bottom: 8px;
    }
    .journey-step {
      flex: 1;
      min-width: 130px;
      text-align: center;
      position: relative;
    }
    .journey-day {
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.8px;
      color: ${brandColor};
      margin-bottom: 6px;
    }
    .journey-bubble {
      background: ${brandColor};
      color: white;
      border-radius: 10px;
      padding: 12px 14px;
      font-size: 12px;
      font-weight: 600;
      line-height: 1.4;
      min-height: 56px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .journey-purpose {
      font-size: 11px;
      color: #888;
      margin-top: 8px;
      font-style: italic;
    }
    .journey-arrow {
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      width: 36px;
      padding-top: 22px;
      color: #ccc;
      font-size: 18px;
    }

    /* Table card wrapper */
    .table-card {
      border-radius: 12px;
      border: 1px solid #e5e7eb;
      background: #fff;
      box-shadow: 0 1px 2px rgba(0,0,0,0.05);
      overflow: hidden;
      margin: 16px 0;
    }
    .content-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
    }
    .content-table th {
      text-align: left;
      padding: 10px 14px;
      background: #f7f8fa;
      font-weight: 600;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: #555;
      border-bottom: 2px solid #e5e5e5;
    }
    .content-table td {
      padding: 10px 14px;
      border-bottom: 1px solid #f0f0f0;
      vertical-align: top;
    }
    .content-table tr:last-child td {
      border-bottom: none;
    }
    .content-table .day-cell {
      font-weight: 600;
      color: #333;
      white-space: nowrap;
    }
    .content-table .title-cell {
      font-weight: 500;
    }
    .content-table .purpose-cell {
      color: #666;
      font-size: 12px;
    }
    .content-table .platform-cell {
      color: #888;
      font-size: 12px;
      white-space: nowrap;
    }

    /* Key messages */
    .key-messages {
      list-style: none;
      padding: 0;
      margin: 16px 0;
    }
    .key-messages li {
      position: relative;
      padding: 10px 16px 10px 32px;
      margin-bottom: 8px;
      background: #f7f8fa;
      border-radius: 8px;
      font-size: 14px;
      line-height: 1.6;
      color: #333;
    }
    .key-messages li::before {
      content: "";
      position: absolute;
      left: 14px;
      top: 17px;
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #0f172a;
    }

    /* Sign-off */
    .sign-off {
      margin-top: 48px;
      border-top: 2px solid #e5e5e5;
      padding-top: 28px;
    }
    .sign-off-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 32px;
      margin-top: 20px;
    }
    .sign-off-box {
      border-bottom: 1px solid #bbb;
      padding-bottom: 48px;
    }
    .sign-off-label {
      font-size: 11px;
      color: #888;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-top: 8px;
    }
    .sign-off-footer {
      margin-top: 28px;
      font-size: 11px;
      color: #aaa;
    }

    /* Print button */
    .toolbar {
      margin-bottom: 28px;
      padding: 14px 20px;
      background: #fff;
      border-radius: 12px;
      border: 1px solid #e5e7eb;
      box-shadow: 0 1px 2px rgba(0,0,0,0.05);
      display: flex;
      gap: 10px;
      align-items: center;
    }
    .toolbar-btn {
      display: inline-block;
      padding: 9px 20px;
      background: #1e293b;
      color: white;
      border: none;
      border-radius: 6px;
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      text-decoration: none;
    }
    .toolbar-btn:hover {
      background: #334155;
    }
    .toolbar-hint {
      font-size: 12px;
      color: #666;
    }
  </style>
</head>
<body>
  <div class="no-print toolbar">
    <button class="toolbar-btn" onclick="window.print()">Save as PDF</button>
    <span class="toolbar-hint">Use your browser's print dialog to save as PDF</span>
  </div>

  <div class="header-card">
    <div class="header-brand-bar" style="background:${brandColor};"></div>
    <div class="header-inner">
      <!-- Logos row -->
      <div class="header-logos">
        <div class="agency-logo">
          <span class="agency-logo-text">AGENCY</span>
          <span class="agency-logo-sub">CONTENT PLATFORM</span>
        </div>
        ${logoUrl
          ? `<img class="client-logo" src="${escapeHtml(logoUrl)}" alt="${escapeHtml(company.name)}" />`
          : `<span class="client-name-text">${escapeHtml(company.name)}</span>`
        }
      </div>

      <hr class="header-divider" />

      <!-- Report title -->
      <div class="header-title-area">
        <div class="header-title-row">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
            <polyline points="14 2 14 8 20 8"></polyline>
            <line x1="16" y1="13" x2="8" y2="13"></line>
            <line x1="16" y1="17" x2="8" y2="17"></line>
            <polyline points="10 9 9 9 8 9"></polyline>
          </svg>
          <h1>Editorial Brief</h1>
        </div>
        <div class="header-date-subtitle">${weekDateRange}</div>

        <!-- Meta information grid -->
        <div class="meta-grid">
          <div>
            <div class="meta-grid-label">Generated</div>
            <div class="meta-grid-value">${reportDate}</div>
          </div>
          <div>
            <div class="meta-grid-label">Week</div>
            <div class="meta-grid-value">${week.week_number}</div>
          </div>
          ${week.theme ? `<div>
            <div class="meta-grid-label">Theme</div>
            <div class="meta-grid-value">${escapeHtml(week.theme)}</div>
          </div>` : ""}
          ${week.subject ? `<div>
            <div class="meta-grid-label">Subject</div>
            <div class="meta-grid-value">${escapeHtml(week.subject)}</div>
          </div>` : ""}
          <div>
            <div class="meta-grid-label">Company</div>
            <div class="meta-grid-value">${escapeHtml(company.name)}</div>
          </div>
          <div>
            <div class="meta-grid-label">Posts</div>
            <div class="meta-grid-value">${sortedPieces.length}</div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- 1. This Week's Story -->
  <h2><span class="section-number">1</span>This Week's Story</h2>
  <div class="story-section">
    ${aiNarrative?.weekStory
      ? aiNarrative.weekStory
          .split(/\n\n+/)
          .map((para) => `<p>${escapeHtml(para)}</p>`)
          .join("\n    ")
      : `<p class="story-fallback">This week's content focuses on${week.subject ? ` "${escapeHtml(week.subject)}"` : " the current theme"}${week.theme ? `, exploring the ${escapeHtml(week.theme)} angle` : ""}. ${sortedPieces.length} pieces are scheduled across the week, working together to build awareness, deepen understanding, and drive action.</p>`
    }
  </div>

  <!-- 2. The Journey -->
  <h2><span class="section-number">2</span>The Journey</h2>
  ${journeySteps.length > 0
    ? `<div class="journey-container">
    ${journeySteps
      .map(
        (step, idx) => `
      ${idx > 0 ? '<div class="journey-arrow">&#8594;</div>' : ""}
      <div class="journey-step">
        <div class="journey-day">${step.day}</div>
        <div class="journey-bubble">${step.titles.map((t) => escapeHtml(t)).join("<br>")}</div>
        <div class="journey-purpose">${step.purpose}</div>
      </div>`
      )
      .join("")}
  </div>`
    : '<p style="font-size: 14px; color: #888;">No scheduled posts yet for this week.</p>'
  }

  <!-- 3. Content at a Glance -->
  <h2><span class="section-number">3</span>Content at a Glance</h2>
  ${sortedPieces.length > 0
    ? `<div class="table-card">
    <table class="content-table">
    <thead>
      <tr>
        <th>Day</th>
        <th>Post Title</th>
        <th>Purpose</th>
        <th>Platform</th>
      </tr>
    </thead>
    <tbody>
      ${sortedPieces
        .map(
          (p, idx) => `<tr>
        <td class="day-cell">${escapeHtml(p.day)}</td>
        <td class="title-cell">${escapeHtml(p.title)}</td>
        <td class="purpose-cell">${purposeSentence(p, idx, sortedPieces.length)}</td>
        <td class="platform-cell">${escapeHtml(p.platform)}</td>
      </tr>`
        )
        .join("\n      ")}
    </tbody>
  </table>
  </div>`
    : '<p style="font-size: 14px; color: #888;">No content pieces created yet for this week.</p>'
  }

  <!-- 4. Key Messages -->
  <h2><span class="section-number">4</span>Key Messages</h2>
  ${aiNarrative?.keyMessages && aiNarrative.keyMessages.length > 0
    ? `<ul class="key-messages">
    ${aiNarrative.keyMessages.map((msg) => `<li>${escapeHtml(msg)}</li>`).join("\n    ")}
  </ul>`
    : `<ul class="key-messages">
    ${sortedPieces.length > 0
      ? sortedPieces
          .slice(0, 5)
          .map((p) => `<li>${escapeHtml(p.title)}</li>`)
          .join("\n    ")
      : '<li>Key messages will appear here once content is created for this week.</li>'
    }
  </ul>`
  }

  <!-- 5. Approval -->
  <div class="sign-off">
    <h2><span class="section-number">5</span>Approval</h2>
    <p style="font-size: 14px; color: #666; margin-bottom: 16px;">
      Please review the editorial brief above and confirm approval by signing below.
    </p>
    <div class="sign-off-grid">
      <div>
        <div class="sign-off-box">
          <p style="font-size: 12px; color: #888; margin-top: 4px;">&nbsp;</p>
        </div>
        <p class="sign-off-label">Client signature</p>
      </div>
      <div>
        <div class="sign-off-box">
          <p style="font-size: 12px; color: #888; margin-top: 4px;">&nbsp;</p>
        </div>
        <p class="sign-off-label">Date</p>
      </div>
    </div>
    <p class="sign-off-footer">
      Report generated by ${escapeHtml(company.name)} Content Platform. ${reportDate}.
    </p>
  </div>
</body>
</html>`;

  return new NextResponse(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Disposition": `inline; filename="editorial-brief-week-${week.week_number}-${company.name.replace(/\s+/g, "-").toLowerCase()}.html"`,
    },
  });
}
