import { NextResponse } from "next/server";
import { requireAdmin, createAdminSupabaseClient } from "@/lib/supabase/admin";

/**
 * GET /api/generate/jobs?companyId=uuid&limit=20
 * List generation jobs, optionally filtered by company.
 * Admin only.
 */
export async function GET(request: Request) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const companyId = searchParams.get("companyId");
  const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 100);

  const supabase = await createAdminSupabaseClient();

  let query = supabase
    .from("content_generation_jobs")
    .select("*, company:companies(name), week:weeks(week_number, year, date_start)")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (companyId) {
    query = query.eq("company_id", companyId);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data: data || [] });
}
