import { NextResponse } from "next/server";
import { requireAdmin, createAdminSupabaseClient } from "@/lib/supabase/admin";

/**
 * GET /api/config/blueprint?companyId=uuid
 * Get the active blueprint for a company.
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
    .from("company_blueprints")
    .select("*")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data: data || [] });
}

/**
 * POST /api/config/blueprint
 * Create a new blueprint version for a company.
 * Body: { companyId, blueprintContent, version?, derivedSourceContext?, derivedBrandContext? }
 */
export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const {
    companyId,
    blueprintContent,
    version,
    derivedSourceContext,
    derivedBrandContext,
  } = body;

  if (!companyId || !blueprintContent) {
    return NextResponse.json(
      { error: "companyId and blueprintContent are required" },
      { status: 400 }
    );
  }

  const supabase = await createAdminSupabaseClient();

  // Deactivate all existing blueprints for this company
  await supabase
    .from("company_blueprints")
    .update({ is_active: false })
    .eq("company_id", companyId);

  // Create the new active blueprint
  const { data, error } = await supabase
    .from("company_blueprints")
    .insert({
      company_id: companyId,
      version: version || "1.0",
      blueprint_content: blueprintContent,
      derived_source_context: derivedSourceContext || null,
      derived_brand_context: derivedBrandContext || null,
      is_active: true,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data });
}

/**
 * PUT /api/config/blueprint
 * Update an existing blueprint.
 * Body: { id, blueprintContent?, derivedSourceContext?, derivedBrandContext?, isActive? }
 */
export async function PUT(request: Request) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { id, ...updates } = body;

  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const supabase = await createAdminSupabaseClient();

  const row: Record<string, unknown> = {};
  if (updates.blueprintContent !== undefined)
    row.blueprint_content = updates.blueprintContent;
  if (updates.derivedSourceContext !== undefined)
    row.derived_source_context = updates.derivedSourceContext;
  if (updates.derivedBrandContext !== undefined)
    row.derived_brand_context = updates.derivedBrandContext;
  if (updates.isActive !== undefined) row.is_active = updates.isActive;

  const { data, error } = await supabase
    .from("company_blueprints")
    .update(row)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data });
}
