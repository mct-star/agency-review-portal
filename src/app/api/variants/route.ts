import { NextResponse } from "next/server";
import { requireAdmin, createAdminSupabaseClient, getSignedInProfile } from "@/lib/supabase/admin";
import { canAccessCompany } from "@/lib/auth/permissions";

/**
 * GET /api/variants?contentPieceId=uuid
 * List all platform variants for a content piece.
 *
 * Needs a signed-in user who may access the piece's company (an admin, or a
 * member of that company). The piece is read first and its company checked;
 * an unknown piece and another company's piece both answer 404, so the
 * caller cannot tell them apart. Same pattern as GET /api/assets.
 */
export async function GET(request: Request) {
  const profile = await getSignedInProfile();
  if (!profile) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const contentPieceId = searchParams.get("contentPieceId");
  if (!contentPieceId) {
    return NextResponse.json(
      { error: "contentPieceId is required" },
      { status: 400 }
    );
  }

  const supabase = await createAdminSupabaseClient();
  const { data: piece } = await supabase
    .from("content_pieces")
    .select("id, company_id")
    .eq("id", contentPieceId)
    .maybeSingle();
  if (!piece || !canAccessCompany(profile, piece.company_id)) {
    return NextResponse.json({ error: "Content piece not found" }, { status: 404 });
  }

  const { data, error } = await supabase
    .from("platform_variants")
    .select("*, social_account:company_social_accounts(platform, account_name)")
    .eq("content_piece_id", contentPieceId)
    .order("platform");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data: data || [] });
}

/**
 * POST /api/variants
 * Create platform variants for a content piece. Admin only.
 * Body: { contentPieceId, variants: [{ platform, adaptedCopy, adaptedFirstComment?, characterCount?, hashtags?, mentions?, socialAccountId? }] }
 */
export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { contentPieceId, variants } = body;

  if (!contentPieceId || !variants || !Array.isArray(variants)) {
    return NextResponse.json(
      { error: "contentPieceId and variants array are required" },
      { status: 400 }
    );
  }

  const supabase = await createAdminSupabaseClient();

  const rows = variants.map(
    (v: {
      platform: string;
      adaptedCopy: string;
      adaptedFirstComment?: string;
      characterCount?: number;
      hashtags?: string[];
      mentions?: string[];
      socialAccountId?: string;
      imageIds?: string[];
      scheduledAt?: string;
      isSelected?: boolean;
    }) => ({
      content_piece_id: contentPieceId,
      platform: v.platform,
      adapted_copy: v.adaptedCopy,
      adapted_first_comment: v.adaptedFirstComment || null,
      character_count: v.characterCount || v.adaptedCopy.length,
      hashtags: v.hashtags || [],
      mentions: v.mentions || [],
      social_account_id: v.socialAccountId || null,
      image_ids: v.imageIds || [],
      scheduled_at: v.scheduledAt || null,
      is_selected: v.isSelected ?? false,
      approval_status: "pending",
    })
  );

  const { data, error } = await supabase
    .from("platform_variants")
    .insert(rows)
    .select();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data, count: data?.length || 0 });
}

/**
 * PUT /api/variants
 * Update a variant.
 * Body: { id, adaptedCopy?, adaptedFirstComment?, isSelected?, approvalStatus?, scheduledAt?, hashtags?, mentions? }
 *
 * Needs a signed-in user who may access the company of the variant's piece.
 * The variant and its piece are read first; an unknown variant, a variant
 * whose piece is missing, and another company's variant all answer the same
 * 404, and nothing is updated. After that an admin may change every listed
 * field; anyone else may change only approvalStatus (403 otherwise).
 */
export async function PUT(request: Request) {
  const profile = await getSignedInProfile();
  if (!profile) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { id, ...updates } = body;

  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const supabase = await createAdminSupabaseClient();

  const { data: variant } = await supabase
    .from("platform_variants")
    .select("id, content_piece_id")
    .eq("id", id)
    .maybeSingle();
  const { data: piece } = variant
    ? await supabase
        .from("content_pieces")
        .select("id, company_id")
        .eq("id", variant.content_piece_id)
        .maybeSingle()
    : { data: null };
  if (!variant || !piece || !canAccessCompany(profile, piece.company_id)) {
    return NextResponse.json({ error: "Variant not found" }, { status: 404 });
  }

  const row: Record<string, unknown> = {};

  if (profile.role === "admin") {
    // Admin can update everything
    if (updates.adaptedCopy !== undefined)
      row.adapted_copy = updates.adaptedCopy;
    if (updates.adaptedFirstComment !== undefined)
      row.adapted_first_comment = updates.adaptedFirstComment;
    if (updates.isSelected !== undefined) row.is_selected = updates.isSelected;
    if (updates.approvalStatus !== undefined)
      row.approval_status = updates.approvalStatus;
    if (updates.scheduledAt !== undefined)
      row.scheduled_at = updates.scheduledAt;
    if (updates.hashtags !== undefined) row.hashtags = updates.hashtags;
    if (updates.mentions !== undefined) row.mentions = updates.mentions;
  } else {
    // Client can only update approval status
    if (updates.approvalStatus !== undefined) {
      row.approval_status = updates.approvalStatus;
    } else {
      return NextResponse.json(
        { error: "Clients can only update approval status" },
        { status: 403 }
      );
    }
  }

  const { data, error } = await supabase
    .from("platform_variants")
    .update(row)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data });
}

/**
 * DELETE /api/variants
 * Remove a variant (admin only).
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
    .from("platform_variants")
    .delete()
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
