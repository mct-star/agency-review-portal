import { NextResponse } from "next/server";
import { requireCompanyUser, createAdminSupabaseClient } from "@/lib/supabase/admin";

/**
 * GET /api/publish/approved?companyId=uuid
 * List all approved content pieces for a company.
 * Used by the publishing dashboard to show what's ready to publish.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const companyId = searchParams.get("companyId");

  if (!companyId) {
    return NextResponse.json(
      { error: "companyId is required" },
      { status: 400 }
    );
  }

  const profile = await requireCompanyUser(companyId);
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (profile.role !== "admin" && !profile.can_publish) {
    return NextResponse.json({ error: "Your account cannot publish." }, { status: 403 });
  }

  const supabase = await createAdminSupabaseClient();
  const { data, error } = await supabase
    .from("content_pieces")
    .select("id, title, content_type, approval_status, week_id, week:weeks(id, week_number, date_start, date_end, pillar, theme, title)")
    .eq("company_id", companyId)
    .eq("approval_status", "approved")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data: data || [] });
}
