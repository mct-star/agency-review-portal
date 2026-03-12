import { NextResponse } from "next/server";
import { requireAdmin, createAdminSupabaseClient } from "@/lib/supabase/admin";
import { encrypt } from "@/lib/crypto";

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
  if (!companyId) {
    return NextResponse.json(
      { error: "companyId is required" },
      { status: 400 }
    );
  }

  const supabase = await createAdminSupabaseClient();
  const { data, error } = await supabase
    .from("company_social_accounts")
    .select("*")
    .eq("company_id", companyId)
    .order("platform");

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
  } = body;

  if (!companyId || !platform) {
    return NextResponse.json(
      { error: "companyId and platform are required" },
      { status: 400 }
    );
  }

  const supabase = await createAdminSupabaseClient();

  const row: Record<string, unknown> = {
    company_id: companyId,
    platform,
    account_name: accountName || null,
    account_id: accountId || null,
    platform_metadata: platformMetadata || {},
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
  const { error } = await supabase
    .from("company_social_accounts")
    .delete()
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
