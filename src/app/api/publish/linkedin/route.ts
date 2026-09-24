import { NextResponse } from "next/server";
import { requireAdmin, createAdminSupabaseClient } from "@/lib/supabase/admin";
import { toLinkedInText, escapeLittleText } from "@/lib/linkedin/post-text";
import { resolvePieceMedia } from "@/lib/content/piece-media";

/**
 * POST /api/publish/linkedin  { pieceId, companyId, dryRun? }
 *
 * Publishes an approved piece to Michael's LinkedIn. The route builds the
 * exact post with the same functions the preview uses (text, escaped
 * little text, media) and queues a `linkedin_publish` job; the Mac poller
 * posts that payload unchanged with the LinkedIn token that lives on the
 * Mac and renews monthly, then records the live URL. The portal never
 * holds a LinkedIn token for this.
 *
 * dryRun returns the exact payload for the confirm step and queues nothing.
 *
 * GET /api/publish/linkedin?jobId=  the job's status and, once posted, the URL.
 */
export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const { pieceId, companyId, dryRun } = body;
  if (!pieceId || !companyId) {
    return NextResponse.json({ error: "pieceId and companyId are required" }, { status: 400 });
  }

  const supabase = await createAdminSupabaseClient();
  const { data: piece, error: pieceErr } = await supabase.from("content_pieces").select("*").eq("id", pieceId).single();
  if (pieceErr || !piece) {
    return NextResponse.json({ error: pieceErr?.message || "Content piece not found" }, { status: 404 });
  }
  if (piece.approval_status !== "approved") {
    return NextResponse.json({ error: "Approve the piece before publishing it." }, { status: 400 });
  }

  // The exact text and media the preview showed.
  const postText = toLinkedInText(piece.markdown_body || "");
  const commentary = escapeLittleText(postText);
  const firstComment = piece.first_comment ? toLinkedInText(piece.first_comment) : null;
  const [{ data: images }, { data: mediaAssets }] = await Promise.all([
    supabase.from("content_images").select("public_url, filename, sort_order, dimensions").eq("content_piece_id", pieceId),
    supabase.from("content_assets").select("asset_type, file_url, text_content, asset_metadata").eq("content_piece_id", pieceId).not("file_url", "is", null),
  ]);
  const media = resolvePieceMedia(piece, images || [], mediaAssets || []);
  if (media.shape === "video" || media.shape === "document") {
    return NextResponse.json(
      { error: `This piece is a ${media.shape} post. Publishing ${media.shape}s to LinkedIn is not built yet, so nothing was posted.` },
      { status: 422 },
    );
  }
  const imageUrls = media.items.filter((m) => m.kind === "image").slice(0, 20).map((m) => m.url);

  // Never twice: not if it is already live, not while a publish is under way.
  const [{ data: published }, { data: pending }] = await Promise.all([
    supabase.from("publishing_jobs").select("external_url").eq("content_piece_id", pieceId)
      .eq("target_platform", "linkedin_personal").eq("status", "published").limit(1),
    supabase.from("content_generation_jobs").select("id").eq("job_type", "linkedin_publish")
      .in("status", ["queued", "running"]).contains("input_payload", { piece_id: pieceId }).limit(1),
  ]);
  if (published && published.length > 0) {
    return NextResponse.json({ error: "This piece is already on LinkedIn.", url: published[0].external_url }, { status: 409 });
  }
  if (pending && pending.length > 0) {
    return NextResponse.json({ error: "This piece is already being published.", jobId: pending[0].id }, { status: 409 });
  }

  if (dryRun) {
    return NextResponse.json({
      dryRun: true,
      postText,
      commentary,
      media: { shape: media.shape, urls: imageUrls },
      firstComment,
      linkedInAccount: { name: "Michael Colling-Tuck" },
    });
  }

  const { data: job, error: jobErr } = await supabase
    .from("content_generation_jobs")
    .insert({
      job_type: "linkedin_publish",
      status: "queued",
      company_id: companyId,
      week_id: null,
      triggered_by: admin.id,
      run_id: crypto.randomUUID(),
      input_payload: { piece_id: pieceId, commentary, image_urls: imageUrls, first_comment: firstComment },
    })
    .select("id")
    .single();
  if (jobErr || !job) {
    return NextResponse.json({ error: jobErr?.message || "Could not queue the post" }, { status: 500 });
  }
  return NextResponse.json({ queued: true, jobId: job.id });
}

export async function GET(request: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const jobId = new URL(request.url).searchParams.get("jobId");
  if (!jobId) return NextResponse.json({ error: "jobId is required" }, { status: 400 });
  const supabase = await createAdminSupabaseClient();
  const { data: job } = await supabase
    .from("content_generation_jobs")
    .select("status, error_message, output_payload")
    .eq("id", jobId)
    .eq("job_type", "linkedin_publish")
    .maybeSingle();
  if (!job) return NextResponse.json({ error: "No such publish job" }, { status: 404 });
  const out = (job.output_payload || {}) as { url?: string; comment_error?: string | null };
  return NextResponse.json({ status: job.status, error: job.error_message, url: out.url || null, commentError: out.comment_error || null });
}
