import { NextResponse } from "next/server";
import { requireAdmin, createAdminSupabaseClient } from "@/lib/supabase/admin";
import { isWeekBoardEnabled } from "@/lib/constants/week-board";

const VALID_ASPECTS = new Set(["9x16", "1x1", "16x9"]);

/**
 * POST /api/admin/clips/run
 * Queue a Mac-engine render for an uploaded phone clip.
 *
 * Body: { contentPieceId: string, aspects?: string[], variant?: "clean" }
 *
 * The piece must already carry a raw_video content_assets row (written by
 * POST /api/media/register with a video target); the newest one is the
 * render source.
 *
 * Single-flight is enforced by the partial unique index
 * content_generation_jobs_piece_video_active_uniq (content_piece_id)
 * where job_type = 'video_rendering' and status in ('queued','running').
 * A violation is surfaced as 409, mirroring the Week Board run route.
 *
 * provider "mac_engine" is the discriminator that keeps this flow and the
 * legacy synchronous Shotstack route (/api/generate/video, which inserts
 * video_rendering rows with no provider at insert time) from ever
 * claiming each other's jobs. This is the interface contract the Mac-side
 * consumer (video_handler.py) reads against: do not rename job_type,
 * provider, or any input_payload key here without updating that handler
 * in lockstep.
 *
 * Deliberately NO weeks mirror: a per-clip render belongs to a week but
 * is not the week, so it must never touch weeks.run_state.
 */
export async function POST(request: Request) {
  if (!isWeekBoardEnabled()) {
    return NextResponse.json(
      { error: "Week Board is not enabled" },
      { status: 404 }
    );
  }

  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const contentPieceId = body?.contentPieceId;
  const aspects: string[] = Array.isArray(body?.aspects) && body.aspects.length
    ? body.aspects
    : ["9x16"];
  const variant = body?.variant ?? "clean";

  if (typeof contentPieceId !== "string" || !contentPieceId) {
    return NextResponse.json(
      { error: "contentPieceId is required" },
      { status: 400 }
    );
  }
  const badAspects = aspects.filter((a) => !VALID_ASPECTS.has(a));
  if (badAspects.length) {
    return NextResponse.json(
      { error: `Unknown aspects: ${badAspects.join(", ")}` },
      { status: 400 }
    );
  }
  if (variant !== "clean") {
    return NextResponse.json(
      { error: 'variant must be "clean" (only value in v1)' },
      { status: 400 }
    );
  }

  const supabase = await createAdminSupabaseClient();

  const { data: piece, error: pieceErr } = await supabase
    .from("content_pieces")
    .select("id, company_id, week_id")
    .eq("id", contentPieceId)
    .single();
  if (pieceErr || !piece) {
    return NextResponse.json(
      { error: "Content piece not found" },
      { status: 404 }
    );
  }

  const { data: rawAssets, error: assetErr } = await supabase
    .from("content_assets")
    .select("id, storage_path, asset_metadata, created_at")
    .eq("content_piece_id", contentPieceId)
    .eq("asset_type", "custom")
    .filter("asset_metadata->>type", "eq", "raw_video")
    .order("created_at", { ascending: false })
    .limit(1);
  const rawAsset = rawAssets?.[0];
  if (assetErr || !rawAsset?.storage_path) {
    return NextResponse.json(
      {
        error:
          "No uploaded clip found for this piece. Upload the video first; " +
          "it registers a raw_video asset this route renders from.",
      },
      { status: 409 }
    );
  }
  const bucket =
    (rawAsset.asset_metadata as Record<string, unknown> | null)?.bucket ??
    "captures";

  const { data: job, error: jobErr } = await supabase
    .from("content_generation_jobs")
    .insert({
      job_type: "video_rendering",
      provider: "mac_engine",
      status: "queued",
      company_id: piece.company_id,
      week_id: piece.week_id,
      content_piece_id: piece.id,
      input_payload: {
        preset: "phone_clip_v1",
        aspects,
        variant,
        source: { bucket, path: rawAsset.storage_path },
        sourceAssetId: rawAsset.id,
      },
      triggered_by: admin.id,
      run_id: crypto.randomUUID(),
    })
    .select()
    .single();

  if (jobErr || !job) {
    if (jobErr?.code === "23505") {
      return NextResponse.json(
        { error: "A render for this clip is already queued or running", code: "ALREADY_RUNNING" },
        { status: 409 }
      );
    }
    console.error("Clip render failed to queue job:", jobErr);
    return NextResponse.json(
      { error: jobErr?.message || "Failed to queue job" },
      { status: 500 }
    );
  }

  return NextResponse.json({ job: { id: job.id, status: job.status } }, { status: 201 });
}
