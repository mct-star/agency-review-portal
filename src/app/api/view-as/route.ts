import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { requireAdmin, createAdminSupabaseClient } from "@/lib/supabase/admin";
import { VIEW_AS_COOKIE, VIEW_AS_COOKIE_OPTIONS, signViewAs, viewAsSecret } from "@/lib/view-as";

/**
 * POST /api/view-as { companyId }   start viewing the platform as that company
 * DELETE /api/view-as               stop
 *
 * Admin only. The cookie is signed with VIEW_AS_SECRET and lasts an hour.
 * Pages read it through getUserProfile; API routes never do, so anything
 * done while viewing is still recorded as the admin.
 */
export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const secret = viewAsSecret();
  if (!secret) return NextResponse.json({ error: "View as is not switched on (VIEW_AS_SECRET is not set)" }, { status: 503 });

  const body = await request.json().catch(() => ({} as Record<string, unknown>));
  const companyId = typeof body.companyId === "string" ? body.companyId : "";
  const supabase = await createAdminSupabaseClient();
  const { data: company } = await supabase.from("companies").select("id, name").eq("id", companyId).maybeSingle();
  if (!company) return NextResponse.json({ error: "Company not found" }, { status: 404 });

  let value: string;
  try {
    value = await signViewAs(company.id as string, secret);
  } catch {
    return NextResponse.json({ error: "companyId must be a uuid" }, { status: 400 });
  }
  (await cookies()).set(VIEW_AS_COOKIE, value, VIEW_AS_COOKIE_OPTIONS);
  return NextResponse.json({ ok: true, companyName: company.name });
}

export async function DELETE() {
  (await cookies()).set(VIEW_AS_COOKIE, "", { ...VIEW_AS_COOKIE_OPTIONS, maxAge: 0 });
  return NextResponse.json({ ok: true });
}
