import { NextResponse } from "next/server";
import { requireCompanyUser, createAdminSupabaseClient } from "@/lib/supabase/admin";

/**
 * GET /api/config/image-mapping?companyId=xxx
 * Returns the company's per-post-type image style mapping.
 *
 * PATCH /api/config/image-mapping
 * Updates the company's per-post-type image style mapping.
 * Body: { companyId: string, mapping: Record<string, ImageMappingEntry> }
 *
 * The mapping is stored as a JSONB field `post_type_image_mapping` on the companies table.
 * Each key is a posting slot ID or post type slug, and the value describes
 * the chosen image style and any style-specific config (e.g. colour for quote cards).
 */

export interface ImageMappingEntry {
  imageStyle: string;
  /** Hex colour for quote cards */
  color?: string;
  /** Character description for 3D/Pixar styles */
  characterDescription?: string;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const companyId = searchParams.get("companyId");

  if (!companyId) {
    return NextResponse.json({ error: "companyId required" }, { status: 400 });
  }

  const profile = await requireCompanyUser(companyId);
  if (!profile) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = await createAdminSupabaseClient();

  // Fetch the mapping from the company record
  const { data } = await supabase
    .from("companies")
    .select("post_type_image_mapping")
    .eq("id", companyId)
    .single();

  // Also fetch posting slots with their post types for the UI
  const { data: slots } = await supabase
    .from("posting_slots")
    .select("id, day_of_week, slot_label, image_archetype, sort_order, post_types:post_type_id(id, slug, label)")
    .eq("company_id", companyId)
    .eq("is_active", true)
    .order("day_of_week")
    .order("sort_order");

  return NextResponse.json({
    mapping: data?.post_type_image_mapping || {},
    slots: slots || [],
  });
}

export async function PATCH(request: Request) {
  const body = await request.json();
  const { companyId, mapping } = body;

  if (!companyId) {
    return NextResponse.json({ error: "companyId required" }, { status: 400 });
  }

  const profile = await requireCompanyUser(companyId);
  if (!profile) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = await createAdminSupabaseClient();
  const { error } = await supabase
    .from("companies")
    .update({ post_type_image_mapping: mapping || {} })
    .eq("id", companyId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
