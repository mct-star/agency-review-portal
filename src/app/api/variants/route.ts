import { NextResponse } from "next/server";
import { requireAdmin, createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * GET /api/variants?contentPieceId=uuid
 * List all platform variants for a content piece.
 * Accessible by both admin and client (client can read their own company's data).
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const contentPieceId = searchParams.get("contentPieceId");
  if (!contentPieceId) {
    return NextResponse.json(
      { error: "contentPieceId is required" },
      { status: 400 }
    );
  }

  const supabase = await createAdminSupabaseClient();
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
 * Create platform variants for a content piece.
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
 * Update a variant (admin can edit everything, client can update approval_status).
 * Body: { id, adaptedCopy?, isSelected?, approvalStatus?, scheduledAt? }
 */
export async function PUT(request: Request) {
  const cookieStore = await cookies();

  // Check auth
  const authClient = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll() {},
      },
    }
  );

  const {
    data: { user: authUser },
  } = await authClient.auth.getUser();
  if (!authUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { id, ...updates } = body;

  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const supabase = await createAdminSupabaseClient();

  // Get user profile to determine permissions
  const { data: profile } = await supabase
    .from("users")
    .select("*")
    .eq("id", authUser.id)
    .single();

  if (!profile) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
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
