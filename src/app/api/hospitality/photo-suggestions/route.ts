import { NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { authoriseCompany } from "@/lib/media/access";
import { getPostType } from "@/lib/constants/post-types";
import { suggestPhotos, wantFor } from "@/lib/hospitality/photo-suggestions";

/**
 * GET /api/hospitality/photo-suggestions?companyId=&postType=&pieceId=
 *
 * Three photos from the venue's library that suit a post, best first, chosen
 * from the tags on each photo. With a pieceId, the post's own weather tags are
 * used and its current photo is left out. Returns an empty list, not an error,
 * when the library has nothing approved yet.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const companyId = url.searchParams.get("companyId");
  const access = await authoriseCompany(companyId);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  const supabase = await createAdminSupabaseClient();
  let slug = url.searchParams.get("postType") || "";
  let weatherTags: string[] = [];
  const exclude: string[] = [];

  const pieceId = url.searchParams.get("pieceId");
  if (pieceId) {
    const { data: piece } = await supabase
      .from("content_pieces")
      .select("id, company_id, post_type, source_meta")
      .eq("id", pieceId)
      .eq("company_id", companyId as string)
      .maybeSingle();
    if (!piece) return NextResponse.json({ error: "Not found" }, { status: 404 });
    slug = slug || (piece.post_type as string) || "";
    const meta = (piece.source_meta || {}) as { weather_tags?: string[]; image_ids?: string[] };
    weatherTags = Array.isArray(meta.weather_tags) ? meta.weather_tags : [];
    if (Array.isArray(meta.image_ids)) exclude.push(...meta.image_ids);
  }

  try {
    const photos = await suggestPhotos(supabase, companyId as string, wantFor(getPostType(slug), weatherTags), 3, exclude);
    return NextResponse.json({ photos });
  } catch (err) {
    console.error("[photo-suggestions]", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Could not read your library just now." }, { status: 502 });
  }
}
