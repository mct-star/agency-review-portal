import { NextResponse } from "next/server";
import { requireAdmin, createAdminSupabaseClient } from "@/lib/supabase/admin";

// GET /api/publish/social-accounts?companyId=...&platform=...
// Returns the active social account for a company + platform.
export async function GET(request: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const companyId = searchParams.get("companyId");
  const platform = searchParams.get("platform");

  if (!companyId) return NextResponse.json({ error: "companyId required" }, { status: 400 });

  const supabase = await createAdminSupabaseClient();

  let query = supabase
    .from("company_social_accounts")
    .select("id, account_name, account_id, token_expires_at, platform")
    .eq("company_id", companyId)
    .eq("is_active", true);

  if (platform) query = query.eq("platform", platform);

  const { data, error } = await query.limit(1).single();

  if (error || !data) return NextResponse.json({ account: null });

  return NextResponse.json({ account: data });
}
