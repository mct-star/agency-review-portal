import { NextResponse } from "next/server";
import { requireAdmin, createAdminSupabaseClient } from "@/lib/supabase/admin";
import { assignTopicsToSlots } from "@/lib/generation/topic-assigner";
import type { PostingSlotWithType, TopicBankEntry } from "@/types/database";

/**
 * POST /api/generate/plan
 *
 * Returns the slot assignments for a week WITHOUT generating any content.
 * The client then calls /api/generate/content for each slot individually.
 * This avoids Vercel's 60-second timeout by keeping each request small.
 *
 * Body: { companyId, weekId, mode, subject? }
 */
export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { companyId, weekId, mode = "variety", subject } = body;

  if (!companyId || !weekId) {
    return NextResponse.json({ error: "companyId and weekId required" }, { status: 400 });
  }

  const supabase = await createAdminSupabaseClient();

  // Fetch company, week, slots, topics, signoff, voice
  const [companyRes, weekRes, blueprintRes, slotsRes, topicsRes, signoffRes, voiceRes] = await Promise.all([
    supabase.from("companies").select("*").eq("id", companyId).single(),
    supabase.from("weeks").select("*").eq("id", weekId).single(),
    supabase.from("company_blueprints").select("blueprint_content, derived_source_context").eq("company_id", companyId).eq("is_active", true).single(),
    supabase.from("posting_slots").select("*, post_types(*)").eq("company_id", companyId).eq("is_active", true).order("sort_order"),
    supabase.from("topic_bank").select("*").eq("company_id", companyId).eq("is_used", false).order("topic_number"),
    supabase.from("company_signoffs").select("*").eq("company_id", companyId).eq("is_active", true).order("sort_order").limit(1).single(),
    supabase.from("company_voice_profiles").select("*").eq("company_id", companyId).eq("is_active", true).order("created_at", { ascending: false }).limit(1).single(),
  ]);

  if (!companyRes.data) return NextResponse.json({ error: "Company not found" }, { status: 404 });
  if (!weekRes.data) return NextResponse.json({ error: "Week not found" }, { status: 404 });

  const company = companyRes.data;
  const week = weekRes.data;
  const slots = (slotsRes.data || []) as PostingSlotWithType[];
  const unusedTopics = (topicsRes.data || []) as TopicBankEntry[];

  if (slots.length === 0) {
    return NextResponse.json({ error: "No posting slots configured" }, { status: 400 });
  }

  // Run auto-assignment
  const { assignments, unassignedSlots } = assignTopicsToSlots({
    slots,
    unusedTopics,
    mode: mode as "cohesive" | "variety",
    weekSubject: subject,
    weekPillar: week.pillar,
    weekTheme: week.theme,
  });

  // Update week subject if cohesive mode
  if (mode === "cohesive" && subject) {
    await supabase.from("weeks").update({ subject }).eq("id", weekId);
  }

  return NextResponse.json({
    assignments,
    unassignedSlots,
    company: {
      id: company.id,
      name: company.name,
      spokespersonName: company.spokesperson_name,
      brandColor: company.brand_color,
    },
    week: {
      id: week.id,
      weekNumber: week.week_number,
      pillar: week.pillar,
      theme: week.theme,
    },
    context: {
      hasBlueprint: !!blueprintRes.data?.blueprint_content,
      hasSourceContext: !!blueprintRes.data?.derived_source_context,
      hasSignoff: !!signoffRes.data,
      hasVoice: !!voiceRes.data,
      signoffText: signoffRes.data?.signoff_text || null,
      firstCommentTemplate: signoffRes.data?.first_comment_template || null,
    },
  });
}
