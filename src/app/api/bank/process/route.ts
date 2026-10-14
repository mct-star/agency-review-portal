import { NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { authoriseCompany } from "@/lib/media/access";
import { autoTagItem, rebuildPreview } from "@/lib/media/library";

export const maxDuration = 60;

/**
 * POST /api/bank/process  { companyId, ids?: string[] }
 *
 * Catch-up for files whose preview or automatic tags did not finish at
 * upload time: rebuilds a missing thumbnail, then tags. Works through up to
 * 8 files a call (one vision call each); the library calls it again while
 * any remain, and a person can retry a single file by passing its id.
 */
const BATCH = 8;

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const access = await authoriseCompany(body.companyId);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  const supabase = await createAdminSupabaseClient();
  const explicit = Array.isArray(body.ids) && body.ids.length > 0;
  // An explicit retry names the files; otherwise anything unfinished.
  const { data: rows } = explicit
    ? await supabase.from("photo_inventory").select("id").eq("company_id", body.companyId).in("id", body.ids.slice(0, BATCH))
    : await supabase
        .from("photo_inventory")
        .select("id")
        .eq("company_id", body.companyId)
        .is("auto_tagged_at", null)
        .order("added_at", { ascending: false })
        .limit(BATCH);

  let tagged = 0;
  let failed = 0;
  for (const r of rows || []) {
    await rebuildPreview(supabase, r.id as string);
    const result = await autoTagItem(supabase, r.id as string);
    if (result.ok) tagged += 1;
    else failed += 1;
  }

  const { count } = await supabase
    .from("photo_inventory")
    .select("id", { count: "exact", head: true })
    .eq("company_id", body.companyId)
    .is("auto_tagged_at", null);
  return NextResponse.json({ ok: true, tagged, failed, remaining: count ?? 0 });
}
