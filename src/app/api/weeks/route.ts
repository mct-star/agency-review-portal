import { NextResponse } from "next/server";
import { requireAdmin, createAdminSupabaseClient } from "@/lib/supabase/admin";

/**
 * GET /api/weeks?companyId=uuid
 * List weeks for a company. Admin only.
 */
export async function GET(request: Request) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const companyId = searchParams.get("companyId");

  if (!companyId) {
    return NextResponse.json(
      { error: "companyId is required" },
      { status: 400 }
    );
  }

  const supabase = await createAdminSupabaseClient();
  const { data, error } = await supabase
    .from("weeks")
    .select("*")
    .eq("company_id", companyId)
    .order("week_number", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data: data || [] });
}

/**
 * POST /api/weeks
 * Create a new week (or ad-hoc content container). Admin only.
 *
 * Body: {
 *   companyId: string,
 *   weekNumber?: number,
 *   year?: number,
 *   title?: string,
 *   status?: string,
 *   dateStart?: string,
 *   dateEnd?: string,
 *   pillar?: string,
 *   theme?: string,
 *   subject?: string,
 * }
 */
export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const {
    companyId,
    weekNumber = 0,
    year = new Date().getFullYear(),
    title,
    status = "draft",
    dateStart,
    dateEnd,
    pillar,
    theme,
    subject,
  } = body;

  if (!companyId) {
    return NextResponse.json({ error: "companyId is required" }, { status: 400 });
  }

  const supabase = await createAdminSupabaseClient();
  const { data, error } = await supabase
    .from("weeks")
    .insert({
      company_id: companyId,
      week_number: weekNumber,
      year,
      title: title || null,
      status,
      date_start: dateStart || null,
      date_end: dateEnd || null,
      pillar: pillar || null,
      theme: theme || null,
      subject: subject || null,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data });
}
