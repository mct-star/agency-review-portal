import { NextResponse } from "next/server";
import { requireCompanyUser, createAdminSupabaseClient } from "@/lib/supabase/admin";
import { resolvePieceMedia } from "@/lib/content/piece-media";
import { toLinkedInText } from "@/lib/linkedin/post-text";
import { toMetaCaption } from "@/lib/meta/direct-publish";
import { toDirectSocialText } from "@/lib/publishing/direct-social";

/**
 * GET /api/publish/approved?companyId=uuid
 * List all approved content pieces for a company.
 * Used by the publishing dashboard to show what's ready to publish.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const companyId = searchParams.get("companyId");

  if (!companyId) {
    return NextResponse.json(
      { error: "companyId is required" },
      { status: 400 }
    );
  }

  const profile = await requireCompanyUser(companyId);
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (profile.role !== "admin" && !profile.can_publish) {
    return NextResponse.json({ error: "Your account cannot publish." }, { status: 403 });
  }

  const supabase = await createAdminSupabaseClient();
  const { data, error } = await supabase
    .from("content_pieces")
    .select("id, title, content_type, approval_status, week_id, markdown_body, first_comment, cover_image_url, week:weeks(id, week_number, date_start, date_end, pillar, theme, title)")
    .eq("company_id", companyId)
    .eq("approval_status", "approved")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const ids = (data || []).map((piece) => piece.id);
  const [images, assets] = ids.length ? await Promise.all([
    supabase.from("content_images").select("content_piece_id,public_url,filename,sort_order,dimensions", { count: "exact" }).in("content_piece_id", ids),
    supabase.from("content_assets").select("content_piece_id,asset_type,file_url,text_content,asset_metadata", { count: "exact" }).in("content_piece_id", ids).not("file_url", "is", null),
  ]) : [{ data: [], error: null, count: 0 }, { data: [], error: null, count: 0 }];
  if (images.error || assets.error) return NextResponse.json({ error: "Could not load approved media for publishing." }, { status: 500 });
  if (images.count !== (images.data || []).length || assets.count !== (assets.data || []).length) return NextResponse.json({ error: "The approved media list is incomplete. Open the content for its publishing options." }, { status: 503 });
  // These ids came only from the company-scoped approved query above.
  const imageGroups = new Map<string, NonNullable<typeof images.data>>();
  const assetGroups = new Map<string, NonNullable<typeof assets.data>>();
  for (const row of images.data || []) imageGroups.set(row.content_piece_id, [...(imageGroups.get(row.content_piece_id) || []), row]);
  for (const row of assets.data || []) assetGroups.set(row.content_piece_id, [...(assetGroups.get(row.content_piece_id) || []), row]);
  return NextResponse.json({ data: (data || []).map(({ markdown_body, first_comment, cover_image_url, ...piece }) => ({
    ...piece,
    preview: { linkedin: toLinkedInText(markdown_body || ""), meta: toMetaCaption(markdown_body || ""), social: toDirectSocialText(markdown_body || ""), firstComment: first_comment ? toLinkedInText(first_comment) : null },
    media: resolvePieceMedia({ title: piece.title, cover_image_url }, imageGroups.get(piece.id) || [], assetGroups.get(piece.id) || []),
  })) }, { headers: { "Cache-Control": "no-store, max-age=0" } });
}
