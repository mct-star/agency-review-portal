import { NextResponse } from "next/server";
import { requireCompanyUser, createAdminSupabaseClient } from "@/lib/supabase/admin";
import { canManageChannels } from "@/lib/auth/permissions";

/**
 * POST /api/publish/newsletter  { pieceId }
 *
 * "Mark as published" for a LinkedIn newsletter article. The article is
 * pasted into LinkedIn by hand (decision of 12 Nov 2026), so there is no
 * integration here: this only records that it went out, using the existing
 * publishing_jobs status model (status published, who, when). An approved
 * piece only, and never twice.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({} as Record<string, unknown>));
  const pieceId = typeof body.pieceId === "string" ? body.pieceId : "";
  if (!pieceId) return NextResponse.json({ error: "pieceId is required" }, { status: 400 });

  const supabase = await createAdminSupabaseClient();
  const { data: piece } = await supabase
    .from("content_pieces")
    .select("id, company_id, content_type, approval_status")
    .eq("id", pieceId)
    .maybeSingle();
  const user = piece ? await requireCompanyUser(piece.company_id) : null;
  if (!piece || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canManageChannels(user, piece.company_id)) {
    return NextResponse.json({ error: "You need the publish right to mark an article as published." }, { status: 403 });
  }
  if (piece.content_type !== "linkedin_article") {
    return NextResponse.json({ error: "Only a LinkedIn newsletter article can be marked as published here." }, { status: 422 });
  }
  if (piece.approval_status !== "approved") {
    return NextResponse.json({ error: "Approve the article before marking it as published." }, { status: 409 });
  }

  const { data: already } = await supabase
    .from("publishing_jobs")
    .select("id, published_at")
    .eq("content_piece_id", pieceId)
    .eq("target_platform", "linkedin_newsletter")
    .eq("status", "published")
    .limit(1);
  if (already && already.length > 0) {
    return NextResponse.json({ error: "This article is already marked as published.", publishedAt: already[0].published_at }, { status: 409 });
  }

  const publishedAt = new Date().toISOString();
  const { data: job, error } = await supabase
    .from("publishing_jobs")
    .insert({
      company_id: piece.company_id,
      content_piece_id: pieceId,
      target_platform: "linkedin_newsletter",
      status: "published",
      published_at: publishedAt,
      triggered_by: user.id,
      publish_payload: { manual: true },
    })
    .select("id, published_at, triggered_by")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ job });
}
