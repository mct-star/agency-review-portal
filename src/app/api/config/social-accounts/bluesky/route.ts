import { NextResponse } from "next/server";
import { requireCompanyUser, createAdminSupabaseClient } from "@/lib/supabase/admin";
import { verifyCredentials } from "@/lib/bluesky/client";
import { encrypt } from "@/lib/crypto";

/**
 * POST /api/config/social-accounts/bluesky
 *
 * Connect a Bluesky account by verifying handle + app password,
 * then saving the encrypted credentials.
 *
 * Body: { companyId, handle, appPassword, spokespersonId? }
 */
export async function POST(request: Request) {
  const body = await request.json();
  const { companyId, handle, appPassword, spokespersonId } = body;

  if (!companyId || !handle || !appPassword) {
    return NextResponse.json(
      { error: "companyId, handle, and appPassword are required" },
      { status: 400 }
    );
  }

  const profile = await requireCompanyUser(companyId);
  if (!profile) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Verify the credentials work
  let verified;
  try {
    verified = await verifyCredentials({ handle, appPassword });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to verify Bluesky credentials" },
      { status: 400 }
    );
  }

  const supabase = await createAdminSupabaseClient();

  // Check if a Bluesky account already exists for this company/spokesperson
  let existingQuery = supabase
    .from("company_social_accounts")
    .select("id")
    .eq("company_id", companyId)
    .eq("platform", "bluesky");

  if (spokespersonId) {
    existingQuery = existingQuery.eq("spokesperson_id", spokespersonId);
  } else {
    existingQuery = existingQuery.is("spokesperson_id", null);
  }

  const { data: existing } = await existingQuery.limit(1).single();

  const accountData = {
    company_id: companyId,
    platform: "bluesky",
    account_id: verified.did,
    account_name: verified.handle,
    access_token_encrypted: encrypt(appPassword),
    spokesperson_id: spokespersonId || null,
    is_active: true,
  };

  if (existing) {
    // Update existing
    await supabase
      .from("company_social_accounts")
      .update(accountData)
      .eq("id", existing.id);
  } else {
    // Create new
    await supabase
      .from("company_social_accounts")
      .insert(accountData);
  }

  return NextResponse.json({
    connected: true,
    handle: verified.handle,
    did: verified.did,
  });
}
