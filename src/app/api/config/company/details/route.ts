import { NextResponse } from "next/server";
import { requireCompanyUser, createAdminSupabaseClient } from "@/lib/supabase/admin";

/**
 * PATCH /api/config/company/details
 * Update company details (name, tagline, website, brand colour, description).
 * Available to any user with access to the company.
 */
export async function PATCH(request: Request) {
  const body = await request.json();
  const { companyId, ...updates } = body;

  if (!companyId) {
    return NextResponse.json({ error: "companyId required" }, { status: 400 });
  }

  const user = await requireCompanyUser(companyId);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Whitelist allowed fields
  const allowed: Record<string, unknown> = {};
  const allowedKeys = ["name", "tagline", "blog_base_url", "brand_color", "brand_palette", "description", "industry", "provider_routing"];

  for (const key of allowedKeys) {
    if (updates[key] !== undefined) {
      allowed[key] = updates[key];
    }
  }

  if (Object.keys(allowed).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  const supabase = await createAdminSupabaseClient();
  const { error } = await supabase
    .from("companies")
    .update(allowed)
    .eq("id", companyId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

/**
 * GET /api/config/company/details?companyId=xxx
 * Fetch company details including provider routing.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const companyId = searchParams.get("companyId");

  if (!companyId) {
    return NextResponse.json({ error: "companyId required" }, { status: 400 });
  }

  const user = await requireCompanyUser(companyId);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = await createAdminSupabaseClient();
  const { data, error } = await supabase
    .from("companies")
    .select("name, tagline, blog_base_url, brand_color, brand_palette, description, industry, provider_routing")
    .eq("id", companyId)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
