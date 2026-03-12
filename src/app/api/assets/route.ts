import { NextResponse } from "next/server";
import { requireAdmin, createAdminSupabaseClient } from "@/lib/supabase/admin";

/**
 * GET /api/assets?contentPieceId=uuid
 * List all assets for a content piece.
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
    .from("content_assets")
    .select("*")
    .eq("content_piece_id", contentPieceId)
    .order("sort_order");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data: data || [] });
}

/**
 * POST /api/assets
 * Create or update assets for a content piece.
 * Body: { contentPieceId, assets: [{ assetType, textContent?, fileUrl?, assetMetadata?, sortOrder? }] }
 */
export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { contentPieceId, assets } = body;

  if (!contentPieceId || !assets || !Array.isArray(assets)) {
    return NextResponse.json(
      { error: "contentPieceId and assets array are required" },
      { status: 400 }
    );
  }

  const supabase = await createAdminSupabaseClient();

  const rows = assets.map(
    (
      a: {
        assetType: string;
        textContent?: string;
        fileUrl?: string;
        storagePath?: string;
        assetMetadata?: Record<string, unknown>;
        sortOrder?: number;
      },
      idx: number
    ) => ({
      content_piece_id: contentPieceId,
      asset_type: a.assetType,
      text_content: a.textContent || null,
      file_url: a.fileUrl || null,
      storage_path: a.storagePath || null,
      asset_metadata: a.assetMetadata || {},
      sort_order: a.sortOrder ?? idx,
    })
  );

  const { data, error } = await supabase
    .from("content_assets")
    .insert(rows)
    .select();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data, count: data?.length || 0 });
}

/**
 * PUT /api/assets
 * Update a single asset.
 * Body: { id, textContent?, fileUrl?, assetMetadata? }
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
  if (updates.textContent !== undefined) row.text_content = updates.textContent;
  if (updates.fileUrl !== undefined) row.file_url = updates.fileUrl;
  if (updates.storagePath !== undefined) row.storage_path = updates.storagePath;
  if (updates.assetMetadata !== undefined)
    row.asset_metadata = updates.assetMetadata;
  if (updates.sortOrder !== undefined) row.sort_order = updates.sortOrder;

  const { data, error } = await supabase
    .from("content_assets")
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
 * DELETE /api/assets
 * Remove an asset.
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
    .from("content_assets")
    .delete()
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
