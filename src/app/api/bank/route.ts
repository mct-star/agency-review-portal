import { NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { authoriseCompany } from "@/lib/media/access";
import { CAPTURES_BUCKET } from "@/lib/upload/media-constants";
import { quotaState } from "@/lib/media/quota";
import { getEffectivePlan } from "@/lib/utils/get-effective-plan";

/**
 * GET /api/bank?companyId=&kind=photo|video&tag=&q=&status=approved|pending&offset=&limit=
 *
 * The photo and video library for one company, newest first. Each item
 * carries a one-hour signed URL for its THUMBNAIL (or video poster) only:
 * the originals stay in the private captures bucket and are fetched one at
 * a time from /api/bank/[id]/original when someone asks for the full file.
 *
 * `tag` may be repeated; an item must carry all of them.
 * The response also carries the storage usage against the plan cap and the
 * count waiting for approval, for the usage bar and the approvals badge.
 */
const PAGE = 120;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const companyId = url.searchParams.get("companyId");
  if (!companyId) return NextResponse.json({ error: "companyId is required" }, { status: 400 });
  const access = await authoriseCompany(companyId);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  const kind = url.searchParams.get("kind");
  const tags = url.searchParams.getAll("tag").filter(Boolean);
  const status = url.searchParams.get("status") === "pending" ? "pending" : "approved";
  const q = (url.searchParams.get("q") || "").trim().replace(/[%,()]/g, "");
  const offset = Math.max(0, Number(url.searchParams.get("offset")) || 0);
  const limit = Math.min(PAGE, Math.max(1, Number(url.searchParams.get("limit")) || PAGE));

  const supabase = await createAdminSupabaseClient();
  let query = supabase
    .from("photo_inventory")
    .select(
      "id, kind, thumb_path, poster_path, mime_type, width, height, duration_seconds, size_bytes, original_filename, scene_label, tags, shows_spokesperson, people_present, text_space, notes, source, status, submitted_by, auto_tagged_at, auto_tag_error, added_at, last_used_at, used_in_weeks",
      { count: "exact" }
    )
    .eq("company_id", companyId)
    .eq("status", status)
    .order("added_at", { ascending: false })
    .range(offset, offset + limit - 1);
  if (kind === "photo" || kind === "video") query = query.eq("kind", kind);
  if (tags.length > 0) query = query.contains("tags", tags);
  if (q) query = query.or(`scene_label.ilike.%${q}%,notes.ilike.%${q}%,original_filename.ilike.%${q}%`);
  const { data, error, count } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = data || [];
  const previewOf = (r: { kind: string; thumb_path: string | null; poster_path: string | null }) =>
    r.kind === "video" ? r.poster_path : r.thumb_path;
  const paths = rows.map((r) => previewOf(r)).filter((p): p is string => !!p);
  const signed = new Map<string, string>();
  if (paths.length > 0) {
    const { data: urls } = await supabase.storage.from(CAPTURES_BUCKET).createSignedUrls(paths, 3600);
    for (const u of urls || []) if (u.path && u.signedUrl) signed.set(u.path, u.signedUrl);
  }

  const [{ data: company }, usedResult, pendingResult, untaggedResult] = await Promise.all([
    supabase.from("companies").select("plan, trial_plan, trial_expires_at").eq("id", companyId).maybeSingle(),
    supabase.rpc("company_media_bytes", { p_company: companyId }),
    supabase.from("photo_inventory").select("id", { count: "exact", head: true }).eq("company_id", companyId).eq("status", "pending"),
    supabase.from("photo_inventory").select("id", { count: "exact", head: true }).eq("company_id", companyId).is("auto_tagged_at", null),
  ]);
  const usage = quotaState(
    Number(usedResult.data ?? 0),
    company ? getEffectivePlan(company as Parameters<typeof getEffectivePlan>[0]) : "starter"
  );

  const allTags = [...new Set(rows.flatMap((r) => (r.tags as string[]) || []))].sort();
  return NextResponse.json({
    data: rows.map((r) => {
      const p = previewOf(r);
      return { ...r, thumb_url: p ? signed.get(p) || null : null };
    }),
    total: count ?? rows.length,
    tags: allTags,
    usage,
    pending: pendingResult.count ?? 0,
    untagged: untaggedResult.count ?? 0,
  });
}
