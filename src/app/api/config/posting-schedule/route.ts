import { NextResponse } from "next/server";
import { requireAdmin, createAdminSupabaseClient } from "@/lib/supabase/admin";

/**
 * GET /api/config/posting-schedule?companyId=uuid
 * Returns the posting schedule for a company: all active posting slots
 * joined with their post type definitions.
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

  // Fetch slots with their post type details
  const { data: slots, error: slotsError } = await supabase
    .from("posting_slots")
    .select("*, post_types(*)")
    .eq("company_id", companyId)
    .order("sort_order");

  if (slotsError) {
    return NextResponse.json({ error: slotsError.message }, { status: 500 });
  }

  // Also fetch all available post types for the library panel
  const { data: postTypes, error: typesError } = await supabase
    .from("post_types")
    .select("*")
    .order("slug");

  if (typesError) {
    return NextResponse.json({ error: typesError.message }, { status: 500 });
  }

  return NextResponse.json({ data: { slots: slots || [], postTypes: postTypes || [] } });
}

/**
 * POST /api/config/posting-schedule
 * Create a new posting slot.
 * Body: { companyId, postTypeId, dayOfWeek, scheduledTime, slotLabel?, imageArchetype?, ctaUrl?, ctaLinkText? }
 */
export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const {
    companyId,
    postTypeId,
    dayOfWeek,
    scheduledTime,
    slotLabel,
    imageArchetype,
    ctaUrl,
    ctaLinkText,
  } = body;

  if (!companyId || !postTypeId || dayOfWeek === undefined || !scheduledTime) {
    return NextResponse.json(
      { error: "companyId, postTypeId, dayOfWeek, and scheduledTime are required" },
      { status: 400 }
    );
  }

  const supabase = await createAdminSupabaseClient();

  // Get next sort order for this company
  const { data: existing } = await supabase
    .from("posting_slots")
    .select("sort_order")
    .eq("company_id", companyId)
    .order("sort_order", { ascending: false })
    .limit(1);

  const nextSort = (existing?.[0]?.sort_order ?? -1) + 1;

  const { data, error } = await supabase
    .from("posting_slots")
    .insert({
      company_id: companyId,
      post_type_id: postTypeId,
      day_of_week: dayOfWeek,
      scheduled_time: scheduledTime,
      slot_label: slotLabel || null,
      image_archetype: imageArchetype || null,
      cta_url: ctaUrl || null,
      cta_link_text: ctaLinkText || null,
      sort_order: nextSort,
    })
    .select("*, post_types(*)")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data });
}

/**
 * PUT /api/config/posting-schedule
 * Update an existing posting slot.
 * Body: { id, ...fields to update }
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

  // Map camelCase to snake_case
  const dbUpdates: Record<string, unknown> = {};
  if (updates.postTypeId !== undefined) dbUpdates.post_type_id = updates.postTypeId;
  if (updates.dayOfWeek !== undefined) dbUpdates.day_of_week = updates.dayOfWeek;
  if (updates.scheduledTime !== undefined) dbUpdates.scheduled_time = updates.scheduledTime;
  if (updates.slotLabel !== undefined) dbUpdates.slot_label = updates.slotLabel;
  if (updates.imageArchetype !== undefined) dbUpdates.image_archetype = updates.imageArchetype;
  if (updates.ctaUrl !== undefined) dbUpdates.cta_url = updates.ctaUrl;
  if (updates.ctaLinkText !== undefined) dbUpdates.cta_link_text = updates.ctaLinkText;
  if (updates.isActive !== undefined) dbUpdates.is_active = updates.isActive;
  if (updates.sortOrder !== undefined) dbUpdates.sort_order = updates.sortOrder;

  const { data, error } = await supabase
    .from("posting_slots")
    .update(dbUpdates)
    .eq("id", id)
    .select("*, post_types(*)")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data });
}

/**
 * DELETE /api/config/posting-schedule?id=uuid
 * Delete a posting slot.
 */
export async function DELETE(request: Request) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const supabase = await createAdminSupabaseClient();

  const { error } = await supabase
    .from("posting_slots")
    .delete()
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
