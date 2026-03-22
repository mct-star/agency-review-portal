import { NextResponse } from "next/server";
import { requireCompanyUser, createAdminSupabaseClient } from "@/lib/supabase/admin";

/**
 * GET /api/content/strategy-topics?companyId=xxx&scope=month|quarter
 *
 * Returns topics from the company's topic bank, scoped by usage:
 * - scope=month: Up to 12 unused topics (for Quick Generate — tight, actionable)
 * - scope=quarter: Up to 40 unused topics (for Content Creator — planning view)
 *
 * Topics are ordered by topic_number (the order they were added in the strategy).
 * Used topics are excluded to keep the list fresh and prevent duplicates.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const companyId = searchParams.get("companyId");
  const scope = searchParams.get("scope") || "month";

  if (!companyId) {
    return NextResponse.json({ error: "companyId is required" }, { status: 400 });
  }

  const profile = await requireCompanyUser(companyId);
  if (!profile) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = await createAdminSupabaseClient();

  const limit = scope === "month" ? 12 : 40;

  const { data: topics, error } = await supabase
    .from("topic_bank")
    .select("id, topic_number, title, pillar, audience_theme, description")
    .eq("company_id", companyId)
    .eq("is_used", false)
    .order("topic_number", { ascending: true })
    .limit(limit);

  if (error) {
    return NextResponse.json(
      { error: `Failed to fetch topics: ${error.message}` },
      { status: 500 }
    );
  }

  // Map to the frontend format
  const mapped = (topics || []).map((t) => ({
    id: t.id,
    topic: t.title,
    pillar: t.pillar || undefined,
    theme: t.audience_theme || undefined,
    description: t.description || undefined,
  }));

  return NextResponse.json({ topics: mapped, total: mapped.length });
}
