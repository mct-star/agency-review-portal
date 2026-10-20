import { NextResponse } from "next/server";
import { createAdminSupabaseClient, requireAdmin } from "@/lib/supabase/admin";

/** Disconnects one Pinterest connection belonging to the explicitly named company and clears its saved credentials. */
export async function DELETE(request: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => null) as { companyId?: unknown; id?: unknown } | null;
  if (typeof body?.companyId !== "string" || typeof body.id !== "string") {
    return NextResponse.json({ error: "companyId and id are required" }, { status: 400 });
  }

  const supabase = await createAdminSupabaseClient();
  const { data: saved, error } = await supabase.from("company_social_accounts").update({
    is_active: false,
    access_token_encrypted: null,
    refresh_token_encrypted: null,
    token_expires_at: null,
  }).eq("id", body.id).eq("company_id", body.companyId).eq("platform", "pinterest").select("id").maybeSingle();
  if (error) return NextResponse.json({ error: "The Pinterest connection could not be disconnected" }, { status: 500 });
  if (!saved) return NextResponse.json({ error: "Pinterest connection not found for this company" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
