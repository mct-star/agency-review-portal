import { NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { authoriseCompany } from "@/lib/media/access";
import { newStaffToken, staffUploadUrl } from "@/lib/staff-upload/token";

/**
 * GET  /api/company/staff-link?companyId=   the current staff upload link
 * POST /api/company/staff-link  { companyId, action: "enable" | "disable" | "rotate" }
 *
 * Rotating issues a new address and the old one stops working at once.
 */
function baseUrl() {
  return process.env.NEXT_PUBLIC_APP_URL || "https://agency-review-portal.vercel.app";
}

export async function GET(request: Request) {
  const companyId = new URL(request.url).searchParams.get("companyId");
  const access = await authoriseCompany(companyId);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  const supabase = await createAdminSupabaseClient();
  const { data } = await supabase.from("companies").select("staff_upload_token, staff_upload_enabled").eq("id", companyId).maybeSingle();
  const enabled = !!data?.staff_upload_enabled && !!data?.staff_upload_token;
  return NextResponse.json({ enabled, url: enabled ? staffUploadUrl(baseUrl(), data!.staff_upload_token as string) : null });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const access = await authoriseCompany(body.companyId);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  if (!["enable", "disable", "rotate"].includes(body.action)) {
    return NextResponse.json({ error: 'action must be "enable", "disable" or "rotate"' }, { status: 400 });
  }

  const supabase = await createAdminSupabaseClient();
  const { data: current } = await supabase.from("companies").select("staff_upload_token").eq("id", body.companyId).maybeSingle();

  const patch: Record<string, unknown> = {};
  if (body.action === "disable") patch.staff_upload_enabled = false;
  if (body.action === "enable") {
    patch.staff_upload_enabled = true;
    if (!current?.staff_upload_token) patch.staff_upload_token = newStaffToken();
  }
  if (body.action === "rotate") {
    patch.staff_upload_enabled = true;
    patch.staff_upload_token = newStaffToken();
  }
  const { data, error } = await supabase.from("companies").update(patch).eq("id", body.companyId).select("staff_upload_token, staff_upload_enabled").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const enabled = !!data.staff_upload_enabled && !!data.staff_upload_token;
  return NextResponse.json({ enabled, url: enabled ? staffUploadUrl(baseUrl(), data.staff_upload_token as string) : null });
}
