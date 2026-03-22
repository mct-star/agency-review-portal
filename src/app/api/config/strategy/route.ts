import { NextResponse } from "next/server";
import { requireAdmin, requireCompanyUser, createAdminSupabaseClient } from "@/lib/supabase/admin";
import { resolveProvider } from "@/lib/providers";

/**
 * GET /api/config/strategy?companyId=...
 * Return all content_themes for a company, with per-theme topic counts.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const companyId = searchParams.get("companyId");
  if (!companyId) return NextResponse.json({ error: "companyId required" }, { status: 400 });

  const user = await requireCompanyUser(companyId);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = await createAdminSupabaseClient();

  const [themesRes, topicsRes, companyRes] = await Promise.all([
    supabase
      .from("content_themes")
      .select("*")
      .eq("company_id", companyId)
      .order("sort_order", { ascending: true }),
    supabase
      .from("topic_bank")
      .select("id, pillar, audience_theme, is_used")
      .eq("company_id", companyId),
    supabase.from("companies").select("content_strategy_mode").eq("id", companyId).single(),
  ]);

  const topics = topicsRes.data || [];

  // Count topics per pillar for summary
  const pillarCounts: Record<string, number> = {};
  for (const t of topics) {
    const key = t.pillar || "Untagged";
    pillarCounts[key] = (pillarCounts[key] || 0) + 1;
  }

  return NextResponse.json({
    themes: themesRes.data || [],
    totalTopics: topics.length,
    usedTopics: topics.filter((t) => t.is_used).length,
    pillarCounts,
    strategyMode: companyRes.data?.content_strategy_mode || "cohesive",
  });
}

/**
 * POST /api/config/strategy
 *
 * Import a content strategy from CSV or markdown.
 * Creates content_themes + topic_bank entries.
 *
 * Body: {
 *   companyId: string,
 *   format: "csv" | "markdown",
 *   content: string,
 *   strategyMode: "cohesive" | "variety",
 * }
 */
export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { companyId, format, content, strategyMode } = body;

  if (!companyId || !format || !content) {
    return NextResponse.json(
      { error: "companyId, format, and content are required" },
      { status: 400 }
    );
  }

  const supabase = await createAdminSupabaseClient();

  // Update strategy mode on company
  if (strategyMode) {
    await supabase
      .from("companies")
      .update({ content_strategy_mode: strategyMode })
      .eq("id", companyId);
  }

  if (format === "csv") {
    return handleCsvImport(supabase, companyId, content);
  } else {
    return handleMarkdownImport(supabase, companyId, content);
  }
}

/**
 * Parse CSV content and import themes + topics.
 * Expected columns: theme, subject, topic, pillar, audience_theme, priority, format, quarter
 */
async function handleCsvImport(
  supabase: Awaited<ReturnType<typeof createAdminSupabaseClient>>,
  companyId: string,
  csvContent: string
) {
  const lines = csvContent.trim().split("\n");
  if (lines.length < 2) {
    return NextResponse.json({ error: "CSV must have a header row and at least one data row" }, { status: 400 });
  }

  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
  const themeIdx = headers.indexOf("theme");
  const subjectIdx = headers.indexOf("subject");
  const topicIdx = headers.indexOf("topic");
  const pillarIdx = headers.indexOf("pillar");
  const audienceThemeIdx = headers.indexOf("audience_theme");
  const quarterIdx = headers.indexOf("quarter");

  if (topicIdx === -1 && subjectIdx === -1) {
    return NextResponse.json(
      { error: "CSV must have at least a 'topic' or 'subject' column" },
      { status: 400 }
    );
  }

  // Parse rows
  const themes = new Map<string, { pillar: string; quarter: number | null }>();
  const topics: {
    title: string;
    description: string | null;
    pillar: string | null;
    audience_theme: string | null;
  }[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = parseCSVLine(lines[i]);
    if (cols.length < 2) continue;

    const theme = themeIdx >= 0 ? cols[themeIdx]?.trim() : null;
    const subject = subjectIdx >= 0 ? cols[subjectIdx]?.trim() : null;
    const topic = topicIdx >= 0 ? cols[topicIdx]?.trim() : null;
    const pillar = pillarIdx >= 0 ? cols[pillarIdx]?.trim() : null;
    const audienceTheme = audienceThemeIdx >= 0 ? cols[audienceThemeIdx]?.trim() : null;
    const quarter = quarterIdx >= 0 ? parseInt(cols[quarterIdx]) || null : null;

    // Collect unique themes
    if (theme && !themes.has(theme)) {
      themes.set(theme, { pillar: pillar || "", quarter });
    }

    // Create topic entry (prefer topic column, fall back to subject)
    const topicTitle = topic || subject;
    if (topicTitle) {
      topics.push({
        title: topicTitle,
        description: subject && topic ? `Subject: ${subject}` : null,
        pillar: pillar || null,
        audience_theme: audienceTheme || null,
      });
    }
  }

  // Insert themes
  if (themes.size > 0) {
    const themeRows = Array.from(themes.entries()).map(([name, data], i) => ({
      company_id: companyId,
      theme_name: name,
      pillar: data.pillar || null,
      quarter: data.quarter,
      sort_order: i,
    }));
    await supabase.from("content_themes").insert(themeRows);
  }

  // Insert topics (upsert on company_id + topic_number)
  if (topics.length > 0) {
    // Get the current max topic number
    const { data: maxTopic } = await supabase
      .from("topic_bank")
      .select("topic_number")
      .eq("company_id", companyId)
      .order("topic_number", { ascending: false })
      .limit(1)
      .single();

    let nextNumber = (maxTopic?.topic_number || 0) + 1;

    const topicRows = topics.map((t) => ({
      company_id: companyId,
      topic_number: nextNumber++,
      title: t.title,
      description: t.description,
      pillar: t.pillar,
      audience_theme: t.audience_theme,
      is_used: false,
    }));

    await supabase.from("topic_bank").insert(topicRows);
  }

  // Update setup progress
  await supabase
    .from("setup_progress")
    .upsert(
      { company_id: companyId, step_strategy: true, step_topics: topics.length > 0 },
      { onConflict: "company_id" }
    );

  return NextResponse.json({
    themesCount: themes.size,
    topicsCount: topics.length,
    themes: Array.from(themes.keys()),
  });
}

/**
 * Parse markdown blueprint and extract strategy using Claude.
 */
async function handleMarkdownImport(
  supabase: Awaited<ReturnType<typeof createAdminSupabaseClient>>,
  companyId: string,
  markdownContent: string
) {
  // First, store the blueprint
  await supabase.from("company_blueprints").insert({
    company_id: companyId,
    version: "imported",
    blueprint_content: markdownContent,
    is_active: true,
  });

  // Try to extract structure using Claude
  const resolved = await resolveProvider(companyId, "content_generation");

  if (!resolved) {
    // No AI provider — just store the blueprint, skip extraction
    await supabase
      .from("setup_progress")
      .upsert({ company_id: companyId, step_strategy: true }, { onConflict: "company_id" });

    return NextResponse.json({
      themesCount: 0,
      topicsCount: 0,
      message: "Blueprint stored. Configure an AI provider to extract themes and topics automatically.",
    });
  }

  const apiKey = resolved.credentials.api_key as string;

  try {
    const extractionPrompt = `Analyse this content strategy document and extract:
1. Monthly or quarterly THEMES (e.g., "Why Is This Not Working?", "The Fourth Lever")
2. TOPICS or subjects that individual posts could cover

Return ONLY valid JSON:
{
  "themes": [
    { "name": "Theme Name", "pillar": "P1", "quarter": 1, "description": "Brief description" }
  ],
  "topics": [
    { "title": "Topic title", "pillar": "P1", "audience_theme": "Access", "description": "Brief description" }
  ]
}

Extract as many themes and topics as you can find. Be specific, not generic.`;

    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: (resolved.settings.model as string) || "claude-sonnet-4-20250514",
        max_tokens: 4000,
        messages: [
          {
            role: "user",
            content: `${extractionPrompt}\n\n---\n\nDOCUMENT:\n\n${markdownContent.substring(0, 50000)}`,
          },
        ],
      }),
    });

    if (!claudeRes.ok) throw new Error("Claude API error");

    const claudeData = await claudeRes.json();
    const responseText = claudeData.content?.[0]?.text || "";
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON in response");

    const parsed = JSON.parse(jsonMatch[0]);
    const themes = parsed.themes || [];
    const topics = parsed.topics || [];

    // Insert themes
    if (themes.length > 0) {
      await supabase.from("content_themes").insert(
        themes.map((t: { name: string; pillar?: string; quarter?: number; description?: string }, i: number) => ({
          company_id: companyId,
          theme_name: t.name,
          pillar: t.pillar || null,
          quarter: t.quarter || null,
          description: t.description || null,
          sort_order: i,
        }))
      );
    }

    // Insert topics
    if (topics.length > 0) {
      const { data: maxTopic } = await supabase
        .from("topic_bank")
        .select("topic_number")
        .eq("company_id", companyId)
        .order("topic_number", { ascending: false })
        .limit(1)
        .single();

      let nextNumber = (maxTopic?.topic_number || 0) + 1;

      await supabase.from("topic_bank").insert(
        topics.map((t: { title: string; pillar?: string; audience_theme?: string; description?: string }) => ({
          company_id: companyId,
          topic_number: nextNumber++,
          title: t.title,
          pillar: t.pillar || null,
          audience_theme: t.audience_theme || null,
          description: t.description || null,
          is_used: false,
        }))
      );
    }

    await supabase
      .from("setup_progress")
      .upsert(
        { company_id: companyId, step_strategy: true, step_topics: topics.length > 0 },
        { onConflict: "company_id" }
      );

    return NextResponse.json({
      themesCount: themes.length,
      topicsCount: topics.length,
      themes: themes.map((t: { name: string }) => t.name),
    });
  } catch (err) {
    // AI extraction failed — blueprint is still stored
    await supabase
      .from("setup_progress")
      .upsert({ company_id: companyId, step_strategy: true }, { onConflict: "company_id" });

    return NextResponse.json({
      themesCount: 0,
      topicsCount: 0,
      message: `Blueprint stored but extraction failed: ${err instanceof Error ? err.message : "Unknown error"}`,
    });
  }
}

/**
 * Simple CSV line parser that handles quoted fields with commas.
 */
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}
