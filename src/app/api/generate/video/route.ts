import { NextResponse } from "next/server";
import { requireAdmin, createAdminSupabaseClient } from "@/lib/supabase/admin";
import { getVideoProvider } from "@/lib/providers";

/**
 * POST /api/generate/video
 * Render a video from a video_script content piece.
 *
 * Body: {
 *   companyId: string,
 *   contentPieceId: string,
 *   aspectRatio?: "16:9" | "9:16" | "1:1",
 *   mediaUrls?: string[],  // B-roll image/video URLs
 * }
 *
 * Extracts the script, intro/outro spec, and B-roll timestamps from the
 * content piece's assets, then calls the video rendering provider.
 * Stores the result as content_assets (video URL, thumbnail).
 */
export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { companyId, contentPieceId, aspectRatio, mediaUrls } = body;

  if (!companyId || !contentPieceId) {
    return NextResponse.json(
      { error: "companyId and contentPieceId are required" },
      { status: 400 }
    );
  }

  const supabase = await createAdminSupabaseClient();

  // Fetch the content piece and its assets
  const { data: piece } = await supabase
    .from("content_pieces")
    .select("*")
    .eq("id", contentPieceId)
    .single();

  if (!piece) {
    return NextResponse.json({ error: "Content piece not found" }, { status: 404 });
  }

  if (piece.content_type !== "video_script") {
    return NextResponse.json(
      { error: "Content piece must be a video_script type" },
      { status: 400 }
    );
  }

  // Fetch associated assets
  const { data: assets } = await supabase
    .from("content_assets")
    .select("*")
    .eq("content_piece_id", contentPieceId);

  const findAsset = (type: string) =>
    assets?.find((a) => a.asset_type === type)?.text_content || null;

  // Fetch company for branding
  const { data: company } = await supabase
    .from("companies")
    .select("spokesperson_name, brand_color")
    .eq("id", companyId)
    .single();

  // Create the job record
  const { data: job, error: jobErr } = await supabase
    .from("content_generation_jobs")
    .insert({
      company_id: companyId,
      week_id: piece.week_id,
      content_piece_id: contentPieceId,
      job_type: "video_rendering",
      status: "queued",
      input_payload: { aspectRatio, mediaUrlCount: mediaUrls?.length || 0 },
      progress: 0,
      triggered_by: admin.id,
    })
    .select()
    .single();

  if (jobErr || !job) {
    return NextResponse.json(
      { error: jobErr?.message || "Failed to create job" },
      { status: 500 }
    );
  }

  const jobId = job.id;

  try {
    await supabase
      .from("content_generation_jobs")
      .update({ status: "running", started_at: new Date().toISOString(), progress: 10 })
      .eq("id", jobId);

    // Resolve the video provider
    const { provider, providerName } = await getVideoProvider(companyId);

    await supabase
      .from("content_generation_jobs")
      .update({ provider: providerName, progress: 20 })
      .eq("id", jobId);

    // Call the provider
    const result = await provider.render({
      script: piece.markdown_body,
      introOutroSpec: findAsset("intro_outro_spec"),
      brollTimestamps: findAsset("broll_timestamps"),
      title: piece.title,
      speakerName: company?.spokesperson_name || null,
      brandColor: company?.brand_color || null,
      aspectRatio: aspectRatio || "16:9",
      mediaUrls: mediaUrls || [],
    });

    await supabase
      .from("content_generation_jobs")
      .update({ progress: 80 })
      .eq("id", jobId);

    // Store video and thumbnail as content assets
    const newAssets: {
      content_piece_id: string;
      asset_type: string;
      text_content: string;
      file_url: string;
      asset_metadata: Record<string, unknown>;
      sort_order: number;
    }[] = [
      {
        content_piece_id: contentPieceId,
        asset_type: "custom",
        text_content: `Video (${result.format}, ${result.resolution}, ${result.durationSeconds}s)`,
        file_url: result.videoUrl,
        asset_metadata: {
          type: "rendered_video",
          format: result.format,
          resolution: result.resolution,
          durationSeconds: result.durationSeconds,
        },
        sort_order: 0,
      },
    ];

    if (result.thumbnailUrl) {
      newAssets.push({
        content_piece_id: contentPieceId,
        asset_type: "cover_image",
        text_content: "Video thumbnail",
        file_url: result.thumbnailUrl,
        asset_metadata: { type: "video_thumbnail" },
        sort_order: 1,
      });
    }

    await supabase.from("content_assets").insert(newAssets);

    // Complete the job
    await supabase
      .from("content_generation_jobs")
      .update({
        status: "completed",
        progress: 100,
        completed_at: new Date().toISOString(),
        output_payload: {
          videoUrl: result.videoUrl,
          thumbnailUrl: result.thumbnailUrl,
          durationSeconds: result.durationSeconds,
          format: result.format,
          resolution: result.resolution,
        },
      })
      .eq("id", jobId);

    return NextResponse.json({
      jobId,
      status: "completed",
      videoUrl: result.videoUrl,
      thumbnailUrl: result.thumbnailUrl,
      durationSeconds: result.durationSeconds,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await supabase
      .from("content_generation_jobs")
      .update({
        status: "failed",
        error_message: message,
        completed_at: new Date().toISOString(),
      })
      .eq("id", jobId);

    return NextResponse.json({ jobId, status: "failed", error: message }, { status: 500 });
  }
}
