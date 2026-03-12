import { NextResponse } from "next/server";
import { requireAdmin, createAdminSupabaseClient } from "@/lib/supabase/admin";
import { encrypt, decrypt } from "@/lib/crypto";

/**
 * GET /api/config/api-providers?companyId=uuid
 * List all API provider configs for a company.
 * Credentials are returned masked (never plaintext).
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
    .from("company_api_configs")
    .select("*")
    .eq("company_id", companyId)
    .order("service_category");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Mask credentials — never expose raw keys
  const masked = (data || []).map((config) => ({
    ...config,
    credentials_encrypted: config.credentials_encrypted ? "••••••••" : null,
    has_credentials: !!config.credentials_encrypted,
  }));

  return NextResponse.json({ data: masked });
}

/**
 * POST /api/config/api-providers
 * Create or update an API provider config.
 * Body: { companyId, serviceCategory, provider, credentials?, providerSettings? }
 */
export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { companyId, serviceCategory, provider, credentials, providerSettings } =
    body;

  if (!companyId || !serviceCategory || !provider) {
    return NextResponse.json(
      { error: "companyId, serviceCategory, and provider are required" },
      { status: 400 }
    );
  }

  const supabase = await createAdminSupabaseClient();

  // Encrypt credentials if provided
  let credentialsEncrypted: string | null = null;
  if (credentials && typeof credentials === "object") {
    credentialsEncrypted = encrypt(JSON.stringify(credentials));
  } else if (typeof credentials === "string" && credentials.length > 0) {
    credentialsEncrypted = encrypt(credentials);
  }

  // Upsert — unique on (company_id, service_category, provider)
  const { data, error } = await supabase
    .from("company_api_configs")
    .upsert(
      {
        company_id: companyId,
        service_category: serviceCategory,
        provider,
        credentials_encrypted: credentialsEncrypted,
        provider_settings: providerSettings || {},
        is_active: true,
      },
      {
        onConflict: "company_id,service_category,provider",
      }
    )
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    data: {
      ...data,
      credentials_encrypted: data.credentials_encrypted ? "••••••••" : null,
      has_credentials: !!data.credentials_encrypted,
    },
  });
}

/**
 * DELETE /api/config/api-providers
 * Remove an API provider config.
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
    .from("company_api_configs")
    .delete()
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
