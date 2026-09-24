import { NextResponse } from "next/server";
import { requireAdmin, createAdminSupabaseClient } from "@/lib/supabase/admin";
import { CAPTURES_BUCKET } from "@/lib/upload/media-constants";

/**
 * PATCH /api/bank/[id]  { tags?, scene_label?, notes?, shows_spokesperson?, text_space? }
 * DELETE /api/bank/[id] removes the original from storage and the bank.
 * Copies already attached to posts are separate files and stay.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const patch: Record<string, unknown> = {};
  if (Array.isArray(body.tags)) {
    patch.tags = [...new Set((body.tags as unknown[]).filter((t): t is string => typeof t === "string")
      .map((t) => t.trim().toLowerCase()).filter(Boolean))].slice(0, 30);
  }
  if (typeof body.scene_label === "string" || body.scene_label === null) patch.scene_label = body.scene_label ? String(body.scene_label).slice(0, 200) : null;
  if (typeof body.notes === "string" || body.notes === null) patch.notes = body.notes ? String(body.notes).slice(0, 1000) : null;
  if (typeof body.shows_spokesperson === "boolean") patch.shows_spokesperson = body.shows_spokesperson;
  if (typeof body.text_space === "boolean") patch.text_space = body.text_space;
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: "Nothing to change" }, { status: 400 });
  patch.updated_at = new Date().toISOString();

  const supabase = await createAdminSupabaseClient();
  const { data, error } = await supabase.from("photo_inventory").update(patch).eq("id", id).select("id").maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const supabase = await createAdminSupabaseClient();
  const { data: row } = await supabase.from("photo_inventory").select("bucket, storage_path").eq("id", id).maybeSingle();
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (row.bucket === CAPTURES_BUCKET && row.storage_path) {
    const { error: rmErr } = await supabase.storage.from(CAPTURES_BUCKET).remove([row.storage_path]);
    if (rmErr) return NextResponse.json({ error: `Could not remove the file: ${rmErr.message}` }, { status: 500 });
  }
  const { error } = await supabase.from("photo_inventory").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
