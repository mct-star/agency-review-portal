import { NextResponse } from "next/server";
import { requireCompanyUser, createAdminSupabaseClient } from "@/lib/supabase/admin";

/**
 * GET /api/config/image-styles?companyId=xxx
 * Returns the company's preferred image styles.
 *
 * PATCH /api/config/image-styles
 * Updates the company's preferred image styles.
 * Body: { companyId: string, styles: string[] }
 */

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const companyId = searchParams.get("companyId");

  if (!companyId) {
    return NextResponse.json({ error: "companyId required" }, { status: 400 });
  }

  const profile = await requireCompanyUser(companyId);
  if (!profile) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = await createAdminSupabaseClient();
  const { data } = await supabase
    .from("companies")
    .select("preferred_image_styles")
    .eq("id", companyId)
    .single();

  return NextResponse.json({
    styles: data?.preferred_image_styles || [],
  });
}

export async function PATCH(request: Request) {
  const body = await request.json();
  const { companyId, styles } = body;

  if (!companyId) {
    return NextResponse.json({ error: "companyId required" }, { status: 400 });
  }

  const profile = await requireCompanyUser(companyId);
  if (!profile) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = await createAdminSupabaseClient();
  const { error } = await supabase
    .from("companies")
    .update({ preferred_image_styles: styles || [] })
    .eq("id", companyId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
