import { NextResponse } from "next/server";
import { requireAdmin, createAdminSupabaseClient } from "@/lib/supabase/admin";
import { getTranscriptionProvider } from "@/lib/providers";

/**
 * POST /api/generate/transcribe
 * Transcribe an audio or video file for a content piece.
 *
 * Body: {
 *   companyId: string,
 *   contentPieceId: string,
 *   mediaUrl: string,        // URL of the audio/video file
 *   language?: string,        // ISO 639-1 language code
 *   includeTimestamps?: boolean,
 *   diarize?: boolean,        // Speaker identification
 * }
 *
 * Calls the transcription provider, then stores the result as
 * content_assets (script_text for full text, subtitle_cues for segments).
 */
export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const {
    companyId,
    contentPieceId,
    mediaUrl,
    language,
    includeTimestamps,
    diarize,
  } = body;

  if (!companyId || !contentPieceId || !mediaUrl) {
    return NextResponse.json(
      { error: "companyId, contentPieceId, and mediaUrl are required" },
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
      job_type: "transcription",
      status: "queued",
      input_payload: { mediaUrl, language, includeTimestamps, diarize },
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

    // Resolve the transcription provider
    const { provider, providerName } = await getTranscriptionProvider(companyId);

    await supabase
      .from("content_generation_jobs")
      .update({ provider: providerName, progress: 20 })
      .eq("id", jobId);

    // Call the provider
    const result = await provider.transcribe({
      mediaUrl,
      language,
      includeTimestamps: includeTimestamps ?? true,
      diarize: diarize ?? false,
    });

    await supabase
      .from("content_generation_jobs")
      .update({ progress: 80 })
      .eq("id", jobId);

    // Store transcription as assets
    const newAssets: {
      content_piece_id: string;
      asset_type: string;
      text_content: string;
      asset_metadata: Record<string, unknown>;
      sort_order: number;
    }[] = [
      {
        content_piece_id: contentPieceId,
        asset_type: "script_text",
        text_content: result.text,
        asset_metadata: {
          source: "transcription",
          language: result.language,
          durationSeconds: result.durationSeconds,
          segmentCount: result.segments.length,
        },
        sort_order: 0,
      },
    ];

    // Store subtitle cues if we have segments
    if (result.segments.length > 0) {
      const srtContent = result.segments
        .map((seg, i) => {
          const startTime = formatSrtTime(seg.start);
          const endTime = formatSrtTime(seg.end);
          return `${i + 1}\n${startTime} --> ${endTime}\n${seg.speaker ? `[${seg.speaker}] ` : ""}${seg.text}\n`;
        })
        .join("\n");

      newAssets.push({
        content_piece_id: contentPieceId,
        asset_type: "subtitle_cues",
        text_content: srtContent,
        asset_metadata: {
          format: "srt",
          segmentCount: result.segments.length,
          durationSeconds: result.durationSeconds,
        },
        sort_order: 1,
      });
    }

    await supabase.from("content_assets").insert(newAssets);

    // Also update the content piece markdown_body if it's currently empty
    const { data: currentPiece } = await supabase
      .from("content_pieces")
      .select("markdown_body")
      .eq("id", contentPieceId)
      .single();

    if (currentPiece && (!currentPiece.markdown_body || currentPiece.markdown_body.trim() === "")) {
      await supabase
        .from("content_pieces")
        .update({
          markdown_body: result.text,
          word_count: result.text.split(/\s+/).length,
        })
        .eq("id", contentPieceId);
    }

    // Complete the job
    await supabase
      .from("content_generation_jobs")
      .update({
        status: "completed",
        progress: 100,
        completed_at: new Date().toISOString(),
        output_payload: {
          wordCount: result.text.split(/\s+/).length,
          segmentCount: result.segments.length,
          language: result.language,
          durationSeconds: result.durationSeconds,
        },
      })
      .eq("id", jobId);

    return NextResponse.json({
      jobId,
      status: "completed",
      wordCount: result.text.split(/\s+/).length,
      segmentCount: result.segments.length,
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

/** Format seconds to SRT timestamp (HH:MM:SS,mmm) */
function formatSrtTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.round((seconds % 1) * 1000);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(ms).padStart(3, "0")}`;
}
