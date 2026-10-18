import { NextResponse } from "next/server";
import { requireAdmin, createAdminSupabaseClient } from "@/lib/supabase/admin";
import { encryptJson } from "@/lib/crypto";

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
    return NextResponse.json({ error: "Could not update provider settings" }, { status: 500 });
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

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const { companyId, serviceCategory, provider, credentials, providerSettings } =
    body;

  if (!companyId || !serviceCategory || !provider) {
    return NextResponse.json(
      { error: "companyId, serviceCategory, and provider are required" },
      { status: 400 }
    );
  }

  const supabase = await createAdminSupabaseClient();

  if (serviceCategory === "content_generation" && !["anthropic_claude", "openai_gpt4"].includes(provider)) {
    return NextResponse.json({ error: "Unsupported writing provider" }, { status: 400 });
  }
  if (credentials !== undefined && (!credentials || typeof credentials !== "object" || Array.isArray(credentials) || (serviceCategory === "content_generation" && (typeof credentials.api_key !== "string" || !credentials.api_key.trim())))) {
    return NextResponse.json({ error: "A valid API key is required" }, { status: 400 });
  }
  if (providerSettings !== undefined && (!providerSettings || typeof providerSettings !== "object" || Array.isArray(providerSettings))) {
    return NextResponse.json({ error: "Invalid provider settings" }, { status: 400 });
  }
  if (serviceCategory === "content_generation" && providerSettings?.utility_tier !== undefined && !["economy", "quality"].includes(providerSettings.utility_tier)) {
    return NextResponse.json({ error: "Invalid utility tier" }, { status: 400 });
  }
  // Blank means retain this company's key for this exact provider, never reuse the old provider's key.
  const { data: existing, error: lookupError } = await supabase.from("company_api_configs")
    .select("credentials_encrypted, provider_settings").eq("company_id", companyId)
    .eq("service_category", serviceCategory).eq("provider", provider).maybeSingle();
  if (lookupError) return NextResponse.json({ error: "Could not load provider settings" }, { status: 500 });
  if (serviceCategory === "content_generation" && !credentials && !existing?.credentials_encrypted) {
    return NextResponse.json({ error: "Enter a key for the selected writing provider" }, { status: 400 });
  }
  const credentialsEncrypted = credentials ? encryptJson({ ...credentials, ...(typeof credentials.api_key === "string" ? { api_key: credentials.api_key.trim() } : {}) }) : existing?.credentials_encrypted ?? null;
  const suppliedSettings = providerSettings ?? existing?.provider_settings ?? {};
  const settings = serviceCategory === "content_generation"
    ? { utility_tier: suppliedSettings.utility_tier === "quality" ? "quality" : "economy" }
    : suppliedSettings;

  // Upsert — unique on (company_id, service_category, provider)
  const { data, error } = await supabase
    .from("company_api_configs")
    .upsert(
      {
        company_id: companyId,
        service_category: serviceCategory,
        provider,
        credentials_encrypted: credentialsEncrypted,
        provider_settings: settings,
        is_active: true,
      },
      {
        onConflict: "company_id,service_category,provider",
      }
    )
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: "Could not update provider settings" }, { status: 500 });
  }

  // Retain inactive keys for a later switch, but resolve only one active writer per company.
  if (serviceCategory === "content_generation") {
    const { error: activationError } = await supabase.from("company_api_configs").update({ is_active: false })
      .eq("company_id", companyId).eq("service_category", serviceCategory).neq("provider", provider);
    if (activationError) return NextResponse.json({ error: "Could not activate writing provider" }, { status: 500 });
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

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Invalid request" }, { status: 400 });
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
    return NextResponse.json({ error: "Could not update provider settings" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
