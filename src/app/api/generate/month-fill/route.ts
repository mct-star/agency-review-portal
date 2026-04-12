import { NextResponse } from "next/server";
import { requireCompanyUser, createAdminSupabaseClient } from "@/lib/supabase/admin";
import { resolveProvider } from "@/lib/providers";
import { callClaude, parseClaudeJson, resolveClaudeConfig } from "@/lib/providers/content-adaptation/claude-util";
import type { PostingSlotWithType } from "@/types/database";

export const maxDuration = 120;

/**
 * POST /api/generate/month-fill
 *
 * Creates week records + content_piece skeletons for an entire month,
 * with AI-generated titles based on the company's strategy pillars
 * and narrative arc.
 *
 * Body: { companyId: string, year: number, month: number }
 * month is 0-indexed (0 = January, 11 = December)
 *
 * Returns: { weeks: number, pieces: number, weekIds: string[] }
 */
export async function POST(request: Request) {
  const body = await request.json();
  const { companyId, year, month } = body;

  if (!companyId || year == null || month == null) {
    return NextResponse.json(
      { error: "companyId, year, and month are required" },
      { status: 400 }
    );
  }

  if (month < 0 || month > 11) {
    return NextResponse.json(
      { error: "month must be 0-11 (0 = January)" },
      { status: 400 }
    );
  }

  const user = await requireCompanyUser(companyId);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = await createAdminSupabaseClient();

  // ── 1. Fetch posting slots ──────────────────────────────────
  const { data: slotsRaw } = await supabase
    .from("posting_slots")
    .select("*, post_types(*)")
    .eq("company_id", companyId)
    .eq("is_active", true)
    .order("sort_order");

  const slots = (slotsRaw || []) as PostingSlotWithType[];

  if (slots.length === 0) {
    return NextResponse.json(
      { error: "No posting slots configured. Set up a posting schedule first." },
      { status: 400 }
    );
  }

  // ── 2. Fetch company + strategy data in parallel ───────────
  const [companyRes, sessionRes, topicsRes, arcsRes] = await Promise.all([
    supabase
      .from("companies")
      .select("name, industry, description")
      .eq("id", companyId)
      .single(),
    supabase
      .from("strategy_sessions")
      .select("responses")
      .eq("company_id", companyId)
      .eq("status", "completed")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("topic_bank")
      .select("id, title, pillar, audience_theme")
      .eq("company_id", companyId)
      .eq("is_used", false)
      .order("topic_number"),
    supabase
      .from("strategy_narrative_arcs")
      .select("week_number, theme, pillar, description")
      .eq("company_id", companyId)
      .order("week_number", { ascending: true }),
  ]);

  const company = companyRes.data;
  const companyName = company?.name || "Company";
  const companyIndustry = company?.industry || "";
  const companyDescription = company?.description || "";

  // Extract pillars from strategy responses
  const responses = (sessionRes.data?.responses || {}) as Record<string, unknown>;
  const pillarsRaw = responses.pillars as Array<{ name: string; topics?: string[] }> | undefined;
  const pillars = pillarsRaw || [];

  const topics = topicsRes.data || [];
  const narrativeArcs = arcsRes.data || [];

  // ── 3. Calculate weeks in the month ─────────────────────────
  const MONTH_NAMES = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  const firstOfMonth = new Date(year, month, 1);
  const lastOfMonth = new Date(year, month + 1, 0);

  const mondays: Date[] = [];
  const d = new Date(firstOfMonth);
  // Find the first Monday on or after the 1st
  while (d.getDay() !== 1) {
    d.setDate(d.getDate() + 1);
  }
  // Collect all Mondays in the month
  while (d <= lastOfMonth) {
    mondays.push(new Date(d));
    d.setDate(d.getDate() + 7);
  }
  // If the month starts mid-week, include the Monday before
  if (firstOfMonth.getDay() !== 1) {
    const prevMonday = new Date(firstOfMonth);
    while (prevMonday.getDay() !== 1) {
      prevMonday.setDate(prevMonday.getDate() - 1);
    }
    if (!mondays.some((m) => m.getTime() === prevMonday.getTime())) {
      mondays.unshift(prevMonday);
    }
  }

  const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

  // ── 4. Build week metadata for AI title generation ─────────
  interface WeekSlotInfo {
    weekIndex: number;
    weekNumber: number;
    pillar: string;
    theme: string;
    dayOfWeek: string;
    postType: string;
    postTypeSlug: string;
  }

  const weekSlots: WeekSlotInfo[] = [];

  for (let wi = 0; wi < mondays.length; wi++) {
    const monday = mondays[wi];
    const janFirst = new Date(monday.getFullYear(), 0, 1);
    const daysSinceJan1 = Math.floor((monday.getTime() - janFirst.getTime()) / (24 * 60 * 60 * 1000));
    const weekNumber = Math.ceil((daysSinceJan1 + janFirst.getDay() + 1) / 7);

    // Pick pillar: from narrative arc first, then rotate through pillars
    const arc = narrativeArcs.find((a) => a.week_number === weekNumber);
    const pillarIndex = wi % Math.max(pillars.length, 1);
    const weekPillar = arc?.pillar || pillars[pillarIndex]?.name || "General";
    const weekTheme = arc?.theme || arc?.description || pillars[pillarIndex]?.name || "Industry insights";

    for (const slot of slots) {
      weekSlots.push({
        weekIndex: wi,
        weekNumber,
        pillar: weekPillar,
        theme: weekTheme,
        dayOfWeek: DAY_NAMES[slot.day_of_week] || "Monday",
        postType: slot.post_types?.label || "Post",
        postTypeSlug: slot.post_types?.slug || "post",
      });
    }
  }

  // ── 5. Generate AI titles (or fall back to topic bank) ─────
  type TitleEntry = { weekNumber: number; dayOfWeek: string; postType: string; title: string };
  let aiTitles: TitleEntry[] = [];
  let usedAI = false;

  // Try to use Claude for title generation
  const resolved = await resolveProvider(companyId, "content_generation");
  if (resolved && weekSlots.length > 0) {
    try {
      const { apiKey, model } = resolveClaudeConfig(resolved.credentials, resolved.settings);

      // Build the slot list for the prompt
      const slotListText = weekSlots
        .map(
          (s) =>
            `- Week ${s.weekNumber} | ${s.dayOfWeek} | ${s.postType} | Pillar: ${s.pillar} | Theme: ${s.theme}`
        )
        .join("\n");

      // Include unused topics as inspiration if available
      const topicInspiration =
        topics.length > 0
          ? `\n\nHere are unused topics from the topic bank for inspiration (use these themes but create fresh, compelling hook-style titles):\n${topics
              .slice(0, 30)
              .map((t) => `- ${t.title} (${t.pillar || "general"})`)
              .join("\n")}`
          : "";

      const systemPrompt = `You are a content strategist generating LinkedIn post titles for a content calendar. Each title should be a compelling hook under 12 words that makes someone stop scrolling. Never use colons or hyphens in titles. Avoid cliches.`;

      const userMessage = `Generate LinkedIn post titles for a content calendar.

Company: ${companyName}
Industry: ${companyIndustry}
${companyDescription ? `About: ${companyDescription}` : ""}

Here are the weeks and slots to fill:
${slotListText}
${topicInspiration}

Return ONLY a JSON array of objects with this exact structure (no markdown, no code fences):
[{ "weekNumber": number, "dayOfWeek": "string", "postType": "string", "title": "string" }]

Generate exactly ${weekSlots.length} titles, one per slot listed above. Each title must be unique, under 12 words, and be a compelling hook relevant to the pillar and theme.`;

      const raw = await callClaude(apiKey, model, systemPrompt, userMessage, 4096);
      aiTitles = parseClaudeJson<TitleEntry[]>(raw);
      usedAI = true;
    } catch (err) {
      console.error("AI title generation failed, falling back to topic bank:", err);
      // Fall through to topic bank fallback
    }
  }

  // ── 6. Create week records + content pieces ─────────────────
  const createdWeekIds: string[] = [];
  let totalPieces = 0;
  let topicIndex = 0;

  for (let wi = 0; wi < mondays.length; wi++) {
    const monday = mondays[wi];
    const weekEnd = new Date(monday);
    weekEnd.setDate(weekEnd.getDate() + 6);

    const janFirst = new Date(monday.getFullYear(), 0, 1);
    const daysSinceJan1 = Math.floor((monday.getTime() - janFirst.getTime()) / (24 * 60 * 60 * 1000));
    const weekNumber = Math.ceil((daysSinceJan1 + janFirst.getDay() + 1) / 7);

    // Check if week already exists
    const { data: existingWeek } = await supabase
      .from("weeks")
      .select("id")
      .eq("company_id", companyId)
      .eq("week_number", weekNumber)
      .eq("year", monday.getFullYear())
      .limit(1)
      .maybeSingle();

    let weekId: string;

    if (existingWeek) {
      weekId = existingWeek.id;
    } else {
      // Pick pillar from narrative arc or rotate
      const arc = narrativeArcs.find((a) => a.week_number === weekNumber);
      const pillarIndex = wi % Math.max(pillars.length, 1);
      const weekPillar = arc?.pillar || pillars[pillarIndex]?.name || null;
      const weekTheme = arc?.theme || null;

      const { data: newWeek, error: weekError } = await supabase
        .from("weeks")
        .insert({
          company_id: companyId,
          week_number: weekNumber,
          year: monday.getFullYear(),
          date_start: monday.toISOString().split("T")[0],
          date_end: weekEnd.toISOString().split("T")[0],
          title: weekTheme ? `Week ${weekNumber} - ${weekTheme}` : `Week ${weekNumber}`,
          pillar: weekPillar,
          status: "draft",
        })
        .select("id")
        .single();

      if (weekError || !newWeek) {
        console.error(`Failed to create week ${weekNumber}:`, weekError);
        continue;
      }
      weekId = newWeek.id;
    }

    createdWeekIds.push(weekId);

    // Create content pieces for each posting slot
    const piecesToInsert = slots.map((slot, slotIdx) => {
      const dayName = DAY_NAMES[slot.day_of_week] || "Monday";
      const postTypeLabel = slot.post_types?.label || "Post";

      // Try AI-generated title first
      let title: string | undefined;
      if (usedAI && aiTitles.length > 0) {
        const match = aiTitles.find(
          (t) =>
            t.weekNumber === weekNumber &&
            t.dayOfWeek === dayName &&
            t.postType === postTypeLabel
        );
        if (match) {
          title = match.title;
          // Remove used title to prevent duplicates
          aiTitles = aiTitles.filter((t) => t !== match);
        }
      }

      // Fall back to topic bank, then to pillar name
      if (!title) {
        if (topics.length > 0) {
          const topic = topics[topicIndex % topics.length];
          title = topic.title;
          topicIndex++;
        } else if (pillars.length > 0) {
          const pillar = pillars[slotIdx % pillars.length];
          title = `${postTypeLabel} - ${pillar.name}`;
        } else {
          title = `${postTypeLabel} - Slot ${slotIdx + 1}`;
        }
      }

      return {
        week_id: weekId,
        company_id: companyId,
        content_type: slot.post_types?.content_type || "social_post",
        title,
        post_type: slot.post_types?.slug || null,
        day_of_week: dayName,
        scheduled_time: slot.scheduled_time || null,
        markdown_body: "",
        sort_order: slotIdx,
        approval_status: "pending" as const,
        image_generation_status: "skipped" as const,
      };
    });

    if (piecesToInsert.length > 0) {
      const { error: insertError } = await supabase
        .from("content_pieces")
        .insert(piecesToInsert);

      if (insertError) {
        console.error(`Failed to insert pieces for week ${weekNumber}:`, insertError);
      } else {
        totalPieces += piecesToInsert.length;
      }
    }
  }

  // Mark topics as used if we consumed them
  if (!usedAI && topics.length > 0 && topicIndex > 0) {
    const usedTopicIds = topics.slice(0, topicIndex).map((t) => t.id);
    await supabase
      .from("topic_bank")
      .update({ is_used: true })
      .in("id", usedTopicIds);
  }

  return NextResponse.json({
    weeks: createdWeekIds.length,
    pieces: totalPieces,
    weekIds: createdWeekIds,
    month: `${MONTH_NAMES[month]} ${year}`,
    aiGenerated: usedAI,
  });
}
