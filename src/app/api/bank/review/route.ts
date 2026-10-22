import { NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { authoriseCompany } from "@/lib/media/access";
import { CAPTURES_BUCKET } from "@/lib/upload/media-constants";

/**
 * POST /api/bank/review  { companyId, ids: string[], decision: "approve" | "reject" }
 *
 * One tap on a photo sent in through the staff upload link. Approving makes
 * it usable on posts. Rejecting deletes it (the original, its thumbnail and
 * the row): a person chose that, so it is the one deletion the library does.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const access = await authoriseCompany(body.companyId);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  const ids: string[] = Array.isArray(body.ids) ? body.ids.filter((i: unknown): i is string => typeof i === "string").slice(0, 200) : [];
  if (ids.length === 0) return NextResponse.json({ error: "ids is required" }, { status: 400 });
  if (body.decision !== "approve" && body.decision !== "reject") {
    return NextResponse.json({ error: 'decision must be "approve" or "reject"' }, { status: 400 });
  }

  const supabase = await createAdminSupabaseClient();
  // Only this company's items that are still pending, whatever ids were sent.
  const { data: rows } = await supabase
    .from("photo_inventory")
    .select("id, storage_path, thumb_path, poster_path")
    .eq("company_id", body.companyId)
    .eq("status", "pending")
    .in("id", ids);
  const items = rows || [];
  if (items.length === 0) return NextResponse.json({ ok: true, changed: 0 });
  const found = items.map((r) => r.id as string);

  if (body.decision === "approve") {
    const { error } = await supabase
      .from("photo_inventory")
      .update({ status: "approved", reviewed_by: access.profile.id, reviewed_at: new Date().toISOString() })
      .in("id", found);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, changed: found.length });
  }

  const paths = items.flatMap((r) => [r.storage_path, r.thumb_path, r.poster_path]).filter((p): p is string => !!p);
  if (paths.length > 0) {
    const { error: rmErr } = await supabase.storage.from(CAPTURES_BUCKET).remove(paths);
    if (rmErr) return NextResponse.json({ error: `Could not remove the files: ${rmErr.message}` }, { status: 500 });
  }
  const { error } = await supabase.from("photo_inventory").delete().in("id", found);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, changed: found.length });
}
