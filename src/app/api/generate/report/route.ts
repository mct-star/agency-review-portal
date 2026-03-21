import { NextResponse } from "next/server";
import { requireAdmin, createAdminSupabaseClient } from "@/lib/supabase/admin";

/**
 * GET /api/generate/report?weekId=xxx&companyId=xxx
 *
 * Generates a downloadable HTML report summarising the week's content strategy,
 * themes, topics, narrative arc, CTA hierarchy, and ecosystem structure.
 * Designed to be printed or saved as PDF for client sign-off.
 */
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
  const [companyRes, weekRes, piecesRes, ctaRes, ecosystemRes, blueprintRes] = await Promise.all([
    supabase.from("companies").select("*").eq("id", companyId).single(),
    supabase.from("weeks").select("*").eq("id", weekId).single(),
    supabase
      .from("content_pieces")
      .select("*")
      .eq("week_id", weekId)
      .order("sort_order"),
    supabase
      .from("company_cta_urls")
      .select("*")
      .eq("company_id", companyId)
      .eq("is_active", true)
      .order("sort_order"),
    supabase
      .from("week_ecosystems")
      .select("*")
      .eq("week_id", weekId)
      .single(),
    supabase
      .from("company_blueprints")
      .select("blueprint_content")
      .eq("company_id", companyId)
      .eq("is_active", true)
      .single(),
  ]);

  const company = companyRes.data;
  const week = weekRes.data;
  const pieces = piecesRes.data || [];
  const ctaUrls = ctaRes.data || [];
  const ecosystem = ecosystemRes.data;

  if (!company || !week) {
    return NextResponse.json({ error: "Company or week not found" }, { status: 404 });
  }

  // Extract pillar from blueprint (simplified)
  const blueprint = blueprintRes.data?.blueprint_content || "";
  const pillarMatch = blueprint.match(/Content Pillars?[\s\S]*?(?=##|\n\n\n)/i);
  const pillarSummary = pillarMatch ? pillarMatch[0].slice(0, 500) : null;

  // Analyse the pieces for the report
  const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const pieceSummaries = pieces.map((p) => ({
    title: p.title,
    type: p.post_type || p.content_type,
    day: p.day_of_week ? DAY_NAMES[parseInt(p.day_of_week)] : "Unscheduled",
    time: p.scheduled_time || "",
    ecosystemRole: p.ecosystem_role || "general",
    ctaTier: p.cta_tier_used || "none",
    wordCount: p.word_count || 0,
    pillar: p.pillar || "",
    audienceTheme: p.audience_theme || "",
    topicRef: p.topic_bank_ref || "",
    status: p.approval_status || "pending",
  }));

  // Group by ecosystem role
  const anchors = pieceSummaries.filter((p) => p.ecosystemRole === "anchor");
  const teasers = pieceSummaries.filter((p) => p.ecosystemRole === "teaser");
  const escalations = pieceSummaries.filter((p) => p.ecosystemRole === "cta_escalation");
  const engagement = pieceSummaries.filter((p) => p.ecosystemRole === "engagement");
  const personalBridges = pieceSummaries.filter((p) => p.ecosystemRole === "personal_bridge");

  // CTA hierarchy breakdown
  const primaryCtas = ctaUrls.filter((c) => c.cta_tier === "primary");
  const secondaryCtas = ctaUrls.filter((c) => c.cta_tier === "secondary");
  const tertiaryCtas = ctaUrls.filter((c) => c.cta_tier === "tertiary");

  // Build narrative arc
  const narrativeArc = pieceSummaries
    .sort((a, b) => {
      const dayOrder = DAY_NAMES.indexOf(a.day) - DAY_NAMES.indexOf(b.day);
      if (dayOrder !== 0) return dayOrder;
      return (a.time || "").localeCompare(b.time || "");
    })
    .map((p) => `${p.day}${p.time ? ` ${p.time}` : ""}: ${p.title} (${p.type}, ${p.ecosystemRole})`);

  // Build the HTML report
  const reportDate = new Date().toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const weekDateRange = week.date_start && week.date_end
    ? `${new Date(week.date_start).toLocaleDateString("en-GB", { day: "numeric", month: "short" })} – ${new Date(week.date_end).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`
    : `Week ${week.week_number}`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Content Strategy Report – ${company.name} – ${weekDateRange}</title>
  <style>
    @media print {
      body { font-size: 11pt; }
      .no-print { display: none; }
      .page-break { page-break-before: always; }
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      line-height: 1.6;
      color: #1a1a1a;
      max-width: 800px;
      margin: 0 auto;
      padding: 40px 24px;
    }
    h1 { font-size: 24px; font-weight: 700; margin-bottom: 4px; }
    h2 { font-size: 18px; font-weight: 700; margin-top: 32px; margin-bottom: 12px; color: #111; border-bottom: 2px solid #e5e5e5; padding-bottom: 6px; }
    h3 { font-size: 14px; font-weight: 600; margin-top: 16px; margin-bottom: 8px; color: #333; }
    p { margin-bottom: 8px; font-size: 14px; }
    .subtitle { font-size: 14px; color: #666; margin-bottom: 24px; }
    .meta { display: flex; gap: 24px; flex-wrap: wrap; margin-bottom: 24px; }
    .meta-item { font-size: 12px; color: #888; }
    .meta-item strong { color: #333; }
    table { width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 13px; }
    th { text-align: left; padding: 8px 12px; background: #f5f5f5; font-weight: 600; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: #555; border-bottom: 2px solid #e5e5e5; }
    td { padding: 8px 12px; border-bottom: 1px solid #eee; vertical-align: top; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; }
    .badge-primary { background: #fef2f2; color: #b91c1c; }
    .badge-secondary { background: #fffbeb; color: #b45309; }
    .badge-tertiary { background: #f0fdf4; color: #15803d; }
    .badge-anchor { background: #eff6ff; color: #1d4ed8; }
    .badge-teaser { background: #faf5ff; color: #7c3aed; }
    .badge-escalation { background: #fef2f2; color: #b91c1c; }
    .badge-engagement { background: #f0fdf4; color: #15803d; }
    .badge-personal { background: #fff7ed; color: #c2410c; }
    .badge-approved { background: #f0fdf4; color: #15803d; }
    .badge-pending { background: #fffbeb; color: #b45309; }
    .badge-changes { background: #fef2f2; color: #b91c1c; }
    .narrative { background: #f9fafb; border-radius: 8px; padding: 16px 20px; margin: 12px 0; }
    .narrative li { font-size: 13px; margin-bottom: 6px; padding-left: 4px; }
    .narrative li::marker { color: #3b82f6; }
    .cta-group { margin-bottom: 12px; }
    .cta-item { font-size: 13px; padding: 4px 0; }
    .sign-off { margin-top: 40px; border-top: 2px solid #e5e5e5; padding-top: 24px; }
    .sign-off-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 32px; margin-top: 16px; }
    .sign-off-box { border-bottom: 1px solid #ccc; padding-bottom: 40px; }
    .sign-off-label { font-size: 11px; color: #888; text-transform: uppercase; letter-spacing: 0.5px; }
    .summary-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin: 12px 0; }
    .summary-card { background: #f9fafb; border-radius: 8px; padding: 12px 16px; text-align: center; }
    .summary-number { font-size: 28px; font-weight: 700; color: #111; }
    .summary-label { font-size: 11px; color: #888; text-transform: uppercase; letter-spacing: 0.5px; }
    .header-bar { background: ${company.brand_color || "#1e293b"}; color: white; padding: 24px; border-radius: 8px; margin-bottom: 24px; }
    .header-bar h1 { color: white; }
    .header-bar .subtitle { color: rgba(255,255,255,0.8); }
    .download-btn { display: inline-block; padding: 10px 20px; background: #1e293b; color: white; border: none; border-radius: 6px; font-size: 14px; cursor: pointer; text-decoration: none; margin-right: 8px; }
    .download-btn:hover { background: #334155; }
  </style>
</head>
<body>
  <div class="no-print" style="margin-bottom: 24px; padding: 16px; background: #f0f9ff; border-radius: 8px; display: flex; gap: 8px; align-items: center;">
    <button class="download-btn" onclick="window.print()">Save as PDF</button>
    <span style="font-size: 13px; color: #666;">Use your browser's print dialog to save as PDF</span>
  </div>

  <div class="header-bar">
    <h1>${company.name}</h1>
    <p class="subtitle">Weekly Content Strategy Report – ${weekDateRange}</p>
  </div>

  <div class="meta">
    <div class="meta-item"><strong>Report generated:</strong> ${reportDate}</div>
    <div class="meta-item"><strong>Week:</strong> ${week.week_number}</div>
    ${week.pillar ? `<div class="meta-item"><strong>Pillar:</strong> ${week.pillar}</div>` : ""}
    ${week.theme ? `<div class="meta-item"><strong>Theme:</strong> ${week.theme}</div>` : ""}
    ${week.subject ? `<div class="meta-item"><strong>Subject:</strong> ${week.subject}</div>` : ""}
  </div>

  <h2>Overview</h2>
  <div class="summary-grid">
    <div class="summary-card">
      <div class="summary-number">${pieces.length}</div>
      <div class="summary-label">Content pieces</div>
    </div>
    <div class="summary-card">
      <div class="summary-number">${anchors.length}</div>
      <div class="summary-label">Anchor content</div>
    </div>
    <div class="summary-card">
      <div class="summary-number">${pieceSummaries.reduce((sum, p) => sum + p.wordCount, 0).toLocaleString()}</div>
      <div class="summary-label">Total words</div>
    </div>
    <div class="summary-card">
      <div class="summary-number">${pieceSummaries.filter((p) => p.status === "approved").length}/${pieces.length}</div>
      <div class="summary-label">Approved</div>
    </div>
  </div>

  ${week.subject ? `
  <h2>Week Subject</h2>
  <p>${week.subject}</p>
  ${week.pillar ? `<p style="font-size: 13px; color: #666;">Content pillar: <strong>${week.pillar}</strong></p>` : ""}
  ${week.theme ? `<p style="font-size: 13px; color: #666;">Audience theme: <strong>${week.theme}</strong></p>` : ""}
  ` : ""}

  <h2>Content Ecosystem Structure</h2>
  <p style="font-size: 13px; color: #666; margin-bottom: 16px;">
    Each piece plays a specific role in driving the audience through a funnel: awareness → engagement → conversion.
  </p>

  ${anchors.length > 0 ? `
  <h3>Anchor Content (${anchors.length})</h3>
  <p style="font-size: 12px; color: #888;">Long-form content that establishes authority. Blog articles, LinkedIn articles. Generated first — all other content links back to these.</p>
  <table>
    <tr><th>Title</th><th>Type</th><th>Day</th><th>Words</th></tr>
    ${anchors.map((p) => `<tr><td>${p.title}</td><td>${p.type}</td><td>${p.day}</td><td>${p.wordCount}</td></tr>`).join("")}
  </table>
  ` : ""}

  ${teasers.length > 0 ? `
  <h3>Teasers (${teasers.length})</h3>
  <p style="font-size: 12px; color: #888;">Social posts that drive traffic to anchor content. Positioned early-to-mid week.</p>
  <table>
    <tr><th>Title</th><th>Type</th><th>Day</th><th>CTA Tier</th></tr>
    ${teasers.map((p) => `<tr><td>${p.title}</td><td>${p.type}</td><td>${p.day}</td><td><span class="badge badge-${p.ctaTier}">${p.ctaTier}</span></td></tr>`).join("")}
  </table>
  ` : ""}

  ${escalations.length > 0 ? `
  <h3>CTA Escalation (${escalations.length})</h3>
  <p style="font-size: 12px; color: #888;">End-of-week posts with primary CTAs. Drive conversion actions (book a call, schedule demo).</p>
  <table>
    <tr><th>Title</th><th>Type</th><th>Day</th><th>CTA Tier</th></tr>
    ${escalations.map((p) => `<tr><td>${p.title}</td><td>${p.type}</td><td>${p.day}</td><td><span class="badge badge-${p.ctaTier}">${p.ctaTier}</span></td></tr>`).join("")}
  </table>
  ` : ""}

  ${engagement.length > 0 ? `
  <h3>Engagement (${engagement.length})</h3>
  <p style="font-size: 12px; color: #888;">Community-building posts. Questions, polls, observations. Build visibility and algorithm reach.</p>
  <table>
    <tr><th>Title</th><th>Type</th><th>Day</th></tr>
    ${engagement.map((p) => `<tr><td>${p.title}</td><td>${p.type}</td><td>${p.day}</td></tr>`).join("")}
  </table>
  ` : ""}

  ${personalBridges.length > 0 ? `
  <h3>Personal Bridges (${personalBridges.length})</h3>
  <p style="font-size: 12px; color: #888;">Weekend / personal posts that humanise the brand. Local, timely, warm.</p>
  <table>
    <tr><th>Title</th><th>Type</th><th>Day</th></tr>
    ${personalBridges.map((p) => `<tr><td>${p.title}</td><td>${p.type}</td><td>${p.day}</td></tr>`).join("")}
  </table>
  ` : ""}

  <div class="page-break"></div>

  <h2>Narrative Arc</h2>
  <p style="font-size: 13px; color: #666; margin-bottom: 8px;">
    The week tells a story. Early posts build awareness, mid-week drives to content, end-of-week converts.
  </p>
  <ol class="narrative">
    ${narrativeArc.map((item) => `<li>${item}</li>`).join("")}
  </ol>

  <h2>Full Content Schedule</h2>
  <table>
    <tr><th>Day</th><th>Time</th><th>Title</th><th>Type</th><th>Role</th><th>CTA</th><th>Status</th></tr>
    ${pieceSummaries
      .sort((a, b) => DAY_NAMES.indexOf(a.day) - DAY_NAMES.indexOf(b.day) || (a.time || "").localeCompare(b.time || ""))
      .map((p) => `<tr>
        <td>${p.day}</td>
        <td>${p.time || "—"}</td>
        <td>${p.title}</td>
        <td>${p.type}</td>
        <td><span class="badge badge-${p.ecosystemRole === "anchor" ? "anchor" : p.ecosystemRole === "teaser" ? "teaser" : p.ecosystemRole === "cta_escalation" ? "escalation" : p.ecosystemRole === "personal_bridge" ? "personal" : "engagement"}">${p.ecosystemRole.replace(/_/g, " ")}</span></td>
        <td>${p.ctaTier !== "none" ? `<span class="badge badge-${p.ctaTier}">${p.ctaTier}</span>` : "—"}</td>
        <td><span class="badge badge-${p.status === "approved" ? "approved" : p.status === "pending" ? "pending" : "changes"}">${p.status}</span></td>
      </tr>`).join("")}
  </table>

  ${ctaUrls.length > 0 ? `
  <h2>CTA Hierarchy</h2>
  <p style="font-size: 13px; color: #666; margin-bottom: 12px;">
    URLs ranked by conversion intent. Primary CTAs drive bookings, secondary drive content consumption, tertiary build soft engagement.
  </p>

  ${primaryCtas.length > 0 ? `
  <div class="cta-group">
    <h3><span class="badge badge-primary">Primary</span> Conversion Actions</h3>
    ${primaryCtas.map((c) => `<div class="cta-item"><strong>${c.label}</strong>: ${c.url}${c.link_text ? ` (${c.link_text})` : ""}</div>`).join("")}
  </div>
  ` : ""}

  ${secondaryCtas.length > 0 ? `
  <div class="cta-group">
    <h3><span class="badge badge-secondary">Secondary</span> Content Consumption</h3>
    ${secondaryCtas.map((c) => `<div class="cta-item"><strong>${c.label}</strong>: ${c.url}${c.link_text ? ` (${c.link_text})` : ""}</div>`).join("")}
  </div>
  ` : ""}

  ${tertiaryCtas.length > 0 ? `
  <div class="cta-group">
    <h3><span class="badge badge-tertiary">Tertiary</span> Soft Engagement</h3>
    ${tertiaryCtas.map((c) => `<div class="cta-item"><strong>${c.label}</strong>: ${c.url}${c.link_text ? ` (${c.link_text})` : ""}</div>`).join("")}
  </div>
  ` : ""}
  ` : ""}

  ${pieceSummaries.some((p) => p.pillar) ? `
  <h2>Topic Clusters</h2>
  <table>
    <tr><th>Pillar</th><th>Audience Theme</th><th>Topic</th><th>Pieces</th></tr>
    ${(() => {
      const clusters: Record<string, typeof pieceSummaries> = {};
      pieceSummaries.forEach((p) => {
        const key = `${p.pillar || "General"}|${p.audienceTheme || "All"}`;
        if (!clusters[key]) clusters[key] = [];
        clusters[key].push(p);
      });
      return Object.entries(clusters)
        .map(([key, items]) => {
          const [pillar, theme] = key.split("|");
          return `<tr>
            <td>${pillar}</td>
            <td>${theme}</td>
            <td>${items.map((i) => i.topicRef || i.title).join("<br>")}</td>
            <td>${items.length}</td>
          </tr>`;
        })
        .join("");
    })()}
  </table>
  ` : ""}

  <div class="sign-off">
    <h2>Sign-Off</h2>
    <p style="font-size: 13px; color: #666; margin-bottom: 16px;">
      Please review the content strategy above and confirm approval by signing below.
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
    <div style="margin-top: 24px;">
      <p style="font-size: 11px; color: #aaa;">
        Report generated by ${company.name} Content Platform. ${reportDate}.
      </p>
    </div>
  </div>
</body>
</html>`;

  return new NextResponse(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Disposition": `inline; filename="content-report-week-${week.week_number}-${company.name.replace(/\s+/g, "-").toLowerCase()}.html"`,
    },
  });
}
