import { NextResponse } from "next/server";
import { requireAdmin, createAdminSupabaseClient } from "@/lib/supabase/admin";
import { CAPTURES_BUCKET } from "@/lib/upload/media-constants";

/**
 * GET /api/bank?companyId=&kind=photo|video&tag=&q=
 *
 * The photo and video bank: every real photo and clip uploaded for the
 * company, newest first, each with a one-hour signed URL to show it (the
 * originals stay in the private captures bucket).
 */
export async function GET(request: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const url = new URL(request.url);
  const companyId = url.searchParams.get("companyId");
  if (!companyId) return NextResponse.json({ error: "companyId is required" }, { status: 400 });
  const kind = url.searchParams.get("kind");
  const tag = url.searchParams.get("tag");
  const q = (url.searchParams.get("q") || "").trim();

  const supabase = await createAdminSupabaseClient();
  let query = supabase
    .from("photo_inventory")
    .select("id, kind, storage_path, bucket, mime_type, width, height, duration_seconds, size_bytes, original_filename, scene_label, tags, shows_spokesperson, text_space, notes, source, added_at, last_used_at, used_in_weeks")
    .eq("company_id", companyId)
    .order("added_at", { ascending: false })
    .limit(500);
  if (kind === "photo" || kind === "video") query = query.eq("kind", kind);
  if (tag) query = query.contains("tags", [tag]);
  if (q) query = query.or(`scene_label.ilike.%${q.replace(/[%,()]/g, "")}%,notes.ilike.%${q.replace(/[%,()]/g, "")}%,original_filename.ilike.%${q.replace(/[%,()]/g, "")}%`);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = data || [];
  const paths = rows.filter((r) => r.bucket === CAPTURES_BUCKET && r.storage_path).map((r) => r.storage_path as string);
  const signed = new Map<string, string>();
  if (paths.length > 0) {
    const { data: urls } = await supabase.storage.from(CAPTURES_BUCKET).createSignedUrls(paths, 3600);
    for (const u of urls || []) if (u.path && u.signedUrl) signed.set(u.path, u.signedUrl);
  }
  const allTags = [...new Set(rows.flatMap((r) => (r.tags as string[]) || []))].sort();
  return NextResponse.json({
    data: rows.map((r) => ({ ...r, view_url: signed.get(r.storage_path as string) || null })),
    tags: allTags,
  });
}
