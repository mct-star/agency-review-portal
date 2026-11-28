import { NextResponse } from "next/server";
import { requireAdmin, createAdminSupabaseClient } from "@/lib/supabase/admin";
import { encrypt } from "@/lib/crypto";

/**
 * LinkedIn page rows carry the default page flag and the on/off switch, and
 * removing or rewriting one can change which page company posts go to. They
 * are managed only through the LinkedIn connection and the publishing
 * settings, never through this generic route.
 */
const MANAGED_PAGE_PLATFORM = "linkedin_company";
const MANAGED_PAGE_MESSAGE =
  "LinkedIn pages are managed from the LinkedIn connection in publishing settings.";

/**
 * GET /api/config/social-accounts?companyId=uuid
 * List all social accounts for a company.
 */
export async function GET(request: Request) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const companyId = searchParams.get("companyId");
  const spokespersonId = searchParams.get("spokespersonId");
  if (!companyId) {
    return NextResponse.json(
      { error: "companyId is required" },
      { status: 400 }
    );
  }

  const supabase = await createAdminSupabaseClient();
  let query = supabase
    .from("company_social_accounts")
    .select("*")
    .eq("company_id", companyId);

  // Filter by spokesperson: null = company accounts only, specific ID = that person's accounts
  if (spokespersonId === "company") {
    query = query.is("spokesperson_id", null);
  } else if (spokespersonId) {
    query = query.eq("spokesperson_id", spokespersonId);
  }
  // No spokespersonId param = return all accounts (backwards compatible)

  const { data, error } = await query.order("platform");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Mask tokens
  const masked = (data || []).map((account) => ({
    ...account,
    access_token_encrypted: account.access_token_encrypted ? "••••••••" : null,
    refresh_token_encrypted: account.refresh_token_encrypted
      ? "••••••••"
      : null,
    has_tokens: !!account.access_token_encrypted,
  }));

  return NextResponse.json({ data: masked });
}

/**
 * POST /api/config/social-accounts
 * Create or update a social account.
 * Body: { companyId, platform, accountName, accountId, accessToken?, refreshToken?, platformMetadata? }
 */
export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const {
    companyId,
    platform,
    accountName,
    accountId,
    accessToken,
    refreshToken,
    tokenExpiresAt,
    platformMetadata,
    spokespersonId,
  } = body;

  if (!companyId || !platform) {
    return NextResponse.json(
      { error: "companyId and platform are required" },
      { status: 400 }
    );
  }

  if (platform === MANAGED_PAGE_PLATFORM) {
    return NextResponse.json({ error: MANAGED_PAGE_MESSAGE }, { status: 409 });
  }

  const supabase = await createAdminSupabaseClient();

  const row: Record<string, unknown> = {
    company_id: companyId,
    platform,
    account_name: accountName || null,
    account_id: accountId || null,
    platform_metadata: platformMetadata || {},
    spokesperson_id: spokespersonId || null,
    is_active: true,
  };

  if (accessToken) {
    row.access_token_encrypted = encrypt(accessToken);
  }
  if (refreshToken) {
    row.refresh_token_encrypted = encrypt(refreshToken);
  }
  if (tokenExpiresAt) {
    row.token_expires_at = tokenExpiresAt;
  }

  const { data, error } = await supabase
    .from("company_social_accounts")
    .upsert(row, { onConflict: "company_id,platform,account_id" })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    data: {
      ...data,
      access_token_encrypted: data.access_token_encrypted ? "••••••••" : null,
      refresh_token_encrypted: data.refresh_token_encrypted
        ? "••••••••"
        : null,
      has_tokens: !!data.access_token_encrypted,
    },
  });
}

/**
 * DELETE /api/config/social-accounts
 * Remove a social account.
 * Body: { id }
 */
export async function DELETE(request: Request) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { id } = body;

  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const supabase = await createAdminSupabaseClient();
  const { data: account, error: readError } = await supabase
    .from("company_social_accounts")
    .select("id,platform")
    .eq("id", id)
    .maybeSingle();

  if (readError) {
    return NextResponse.json({ error: readError.message }, { status: 500 });
  }
  if (!account) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }
  if (account.platform === MANAGED_PAGE_PLATFORM) {
    return NextResponse.json({ error: MANAGED_PAGE_MESSAGE }, { status: 409 });
  }

  const { error } = await supabase
    .from("company_social_accounts")
    .delete()
    .eq("id", id)
    .neq("platform", MANAGED_PAGE_PLATFORM);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
