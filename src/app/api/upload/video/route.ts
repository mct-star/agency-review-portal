import { NextResponse } from "next/server";
import { requireAdmin, createAdminSupabaseClient } from "@/lib/supabase/admin";

/**
 * POST /api/upload/video
 *
 * Uploads a video file (MP4, MOV, WebM) to Supabase Storage
 * and returns a public URL for downstream processing.
 *
 * Accepts multipart/form-data with:
 * - file: the video file
 * - companyId: string
 * - contentPieceId?: string (optional — links to existing content piece)
 *
 * Storage structure:
 *   videos/{companyId}/{timestamp}_{filename}
 *
 * Max file size: 100 MB (enforced by Supabase Storage config)
 */
export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  const companyId = formData.get("companyId") as string | null;
  const contentPieceId = formData.get("contentPieceId") as string | null;

  if (!file || !companyId) {
    return NextResponse.json(
      { error: "file and companyId are required" },
      { status: 400 }
    );
  }

  // Validate file type
  const validTypes = [
    "video/mp4",
    "video/quicktime",
    "video/webm",
    "video/x-msvideo",
    "audio/mpeg",
    "audio/wav",
    "audio/mp4",
    "audio/x-m4a",
  ];

  if (!validTypes.includes(file.type)) {
    return NextResponse.json(
      {
        error: `Unsupported file type: ${file.type}. Supported: MP4, MOV, WebM, AVI, MP3, WAV, M4A`,
      },
      { status: 400 }
    );
  }

  // Validate file size (100 MB)
  const maxSize = 100 * 1024 * 1024;
  if (file.size > maxSize) {
    return NextResponse.json(
      { error: `File too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Max: 100 MB` },
      { status: 400 }
    );
  }

  const supabase = await createAdminSupabaseClient();

  // Sanitize filename
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const timestamp = Date.now();
  const storagePath = `videos/${companyId}/${timestamp}_${safeName}`;

  // Convert File to ArrayBuffer for upload
  const arrayBuffer = await file.arrayBuffer();

  const { error: uploadErr } = await supabase.storage
    .from("media")
    .upload(storagePath, arrayBuffer, {
      contentType: file.type,
      upsert: false,
    });

  if (uploadErr) {
    return NextResponse.json(
      { error: `Upload failed: ${uploadErr.message}` },
      { status: 500 }
    );
  }

  // Get public URL
  const { data: urlData } = supabase.storage
    .from("media")
    .getPublicUrl(storagePath);

  const publicUrl = urlData.publicUrl;

  // If linked to a content piece, store as an asset
  if (contentPieceId) {
    await supabase.from("content_assets").insert({
      content_piece_id: contentPieceId,
      asset_type: "custom",
      text_content: `Uploaded video: ${file.name} (${(file.size / 1024 / 1024).toFixed(1)} MB)`,
      file_url: publicUrl,
      storage_path: storagePath,
      asset_metadata: {
        type: "raw_video",
        mimeType: file.type,
        sizeBytes: file.size,
        originalFilename: file.name,
      },
      sort_order: 0,
    });
  }

  return NextResponse.json({
    url: publicUrl,
    storagePath,
    filename: safeName,
    sizeBytes: file.size,
    mimeType: file.type,
  });
}
