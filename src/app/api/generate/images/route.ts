import { NextResponse } from "next/server";
import { requireAdmin, createAdminSupabaseClient } from "@/lib/supabase/admin";
import { getImageProvider } from "@/lib/providers";

/**
 * POST /api/generate/images
 * Generate images for a content piece.
 *
 * Body: {
 *   companyId: string,
 *   contentPieceId: string,
 *   prompts: { prompt: string, style?: string, aspectRatio?: string }[],
 * }
 *
 * Creates a generation job, calls the image provider for each prompt,
 * then stores the results as content_images rows.
 */
export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { companyId, contentPieceId, prompts } = body;

  if (!companyId || !contentPieceId || !prompts || !Array.isArray(prompts) || prompts.length === 0) {
    return NextResponse.json(
      { error: "companyId, contentPieceId, and prompts array are required" },
      { status: 400 }
    );
  }

  const supabase = await createAdminSupabaseClient();

  // Verify the content piece exists
  const { data: piece } = await supabase
    .from("content_pieces")
    .select("id, week_id")
    .eq("id", contentPieceId)
    .single();

  if (!piece) {
    return NextResponse.json({ error: "Content piece not found" }, { status: 404 });
  }

  // Create the job record
  const { data: job, error: jobErr } = await supabase
    .from("content_generation_jobs")
    .insert({
      company_id: companyId,
      week_id: piece.week_id,
      content_piece_id: contentPieceId,
      job_type: "image_generation",
      status: "queued",
      input_payload: { prompts },
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

    // Resolve the image provider
    const { provider, providerName } = await getImageProvider(companyId);

    await supabase
      .from("content_generation_jobs")
      .update({ provider: providerName, progress: 20 })
      .eq("id", jobId);

    // Get current max sort_order for images on this piece
    const { data: existingImages } = await supabase
      .from("content_images")
      .select("sort_order")
      .eq("content_piece_id", contentPieceId)
      .order("sort_order", { ascending: false })
      .limit(1);

    let nextSort = (existingImages?.[0]?.sort_order ?? -1) + 1;

    // Generate images for each prompt
    const allImages: {
      content_piece_id: string;
      filename: string;
      storage_path: string;
      public_url: string;
      archetype: string | null;
      sort_order: number;
    }[] = [];

    const progressPerPrompt = 60 / prompts.length;

    for (let i = 0; i < prompts.length; i++) {
      const { prompt, style, aspectRatio } = prompts[i];

      const result = await provider.generate({
        prompt,
        style,
        aspectRatio: aspectRatio as "1:1" | "16:9" | "9:16" | "4:3" | undefined,
        count: 1,
      });

      for (const img of result.images) {
        allImages.push({
          content_piece_id: contentPieceId,
          filename: img.filename,
          storage_path: img.url, // For now, store the URL directly
          public_url: img.url,
          archetype: style || null,
          sort_order: nextSort++,
        });
      }

      await supabase
        .from("content_generation_jobs")
        .update({ progress: Math.round(20 + progressPerPrompt * (i + 1)) })
        .eq("id", jobId);
    }

    // Insert all images
    const { data: insertedImages, error: imgErr } = await supabase
      .from("content_images")
      .insert(allImages)
      .select();

    if (imgErr) {
      throw new Error(imgErr.message);
    }

    // Complete the job
    await supabase
      .from("content_generation_jobs")
      .update({
        status: "completed",
        progress: 100,
        completed_at: new Date().toISOString(),
        output_payload: {
          imageCount: insertedImages?.length || 0,
          images: insertedImages?.map((img) => ({
            id: img.id,
            filename: img.filename,
            url: img.public_url,
          })),
        },
      })
      .eq("id", jobId);

    return NextResponse.json({
      jobId,
      status: "completed",
      imageCount: insertedImages?.length || 0,
      images: insertedImages,
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
