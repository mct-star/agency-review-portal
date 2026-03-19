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
 * uploads images to Supabase Storage, then stores permanent URLs as
 * content_images rows.
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
        // ── Persist to Supabase Storage ──────────────────────────────
        // Providers may return temporary URLs (DALL-E) or data URIs (base64).
        // We always download and re-upload to guarantee a permanent URL.
        const permanentUrl = await uploadImageToStorage(
          supabase,
          img.url,
          img.filename,
          companyId,
          contentPieceId
        );

        allImages.push({
          content_piece_id: contentPieceId,
          filename: img.filename,
          storage_path: permanentUrl,
          public_url: permanentUrl,
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

/**
 * Download an image (from URL or data URI) and upload it to Supabase Storage.
 * Returns the permanent public URL from storage.
 *
 * Handles three source types:
 *   1. https:// URLs (DALL-E temporary URLs, fal.ai permanent URLs, etc.)
 *   2. data: URIs (base64-encoded images from gpt-image-1)
 *   3. Supabase storage URLs (already permanent — skip re-upload)
 */
async function uploadImageToStorage(
  supabase: Awaited<ReturnType<typeof createAdminSupabaseClient>>,
  imageUrl: string,
  filename: string,
  companyId: string,
  contentPieceId: string
): Promise<string> {
  const storageBucket = "content-assets";
  const storagePath = `images/${companyId}/${contentPieceId}/${filename}`;

  // Check if this is already a Supabase storage URL — skip re-upload
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  if (imageUrl.includes(supabaseUrl) && imageUrl.includes("/storage/")) {
    return imageUrl;
  }

  let imageBuffer: Buffer;
  let mimeType = "image/png";

  if (imageUrl.startsWith("data:")) {
    // Base64 data URI (gpt-image-1)
    const [header, base64Data] = imageUrl.split(",");
    const mime = header.match(/data:([^;]+)/)?.[1] || "image/png";
    mimeType = mime;
    imageBuffer = Buffer.from(base64Data, "base64");
  } else {
    // HTTP/HTTPS URL — download the image
    const res = await fetch(imageUrl, { signal: AbortSignal.timeout(30_000) });
    if (!res.ok) {
      throw new Error(`Failed to download generated image (${res.status}): ${imageUrl}`);
    }
    const contentType = res.headers.get("content-type");
    if (contentType) mimeType = contentType.split(";")[0];
    imageBuffer = Buffer.from(await res.arrayBuffer());
  }

  // Upload to Supabase Storage
  const { error: uploadErr } = await supabase.storage
    .from(storageBucket)
    .upload(storagePath, imageBuffer, {
      contentType: mimeType,
      upsert: true,
    });

  if (uploadErr) {
    throw new Error(`Failed to upload image to storage: ${uploadErr.message}`);
  }

  // Return the permanent public URL
  const { data: urlData } = supabase.storage
    .from(storageBucket)
    .getPublicUrl(storagePath);

  return urlData.publicUrl;
}
