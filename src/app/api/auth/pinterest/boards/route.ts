import { NextRequest, NextResponse } from "next/server";
import { decrypt } from "@/lib/crypto";
import { createAdminSupabaseClient, requireAdmin } from "@/lib/supabase/admin";
import { listPinterestBoards } from "@/lib/pinterest/oauth";

/** Lists boards accessible to one active Pinterest connection, scoped to the specified company and social account row. */
export async function GET(request: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const companyId = request.nextUrl.searchParams.get("companyId") || "";
  const socialAccountId = request.nextUrl.searchParams.get("socialAccountId") || "";
  if (!companyId || !socialAccountId) return NextResponse.json({ error: "companyId and socialAccountId are required" }, { status: 400 });

  const supabase = await createAdminSupabaseClient();
  const { data: account } = await supabase.from("company_social_accounts")
    .select("id,company_id,account_id,access_token_encrypted,token_expires_at,is_active")
    .eq("id", socialAccountId).eq("company_id", companyId).eq("platform", "pinterest").eq("is_active", true).maybeSingle();
  const expiry = account?.token_expires_at ? Date.parse(account.token_expires_at) : Number.NaN;
  if (!account?.access_token_encrypted || !Number.isFinite(expiry) || expiry <= Date.now()) {
    return NextResponse.json({ error: "The selected Pinterest connection needs reconnecting" }, { status: 409 });
  }

  try {
    const boards = await listPinterestBoards(decrypt(account.access_token_encrypted));
    return NextResponse.json({ boards: boards.map(({ id, name }) => ({ id, name })) });
  } catch {
    return NextResponse.json({ error: "Pinterest boards could not be loaded. Reconnect the account if the access has expired." }, { status: 502 });
  }
}
