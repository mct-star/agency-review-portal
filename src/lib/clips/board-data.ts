import type { SupabaseClient } from "@supabase/supabase-js";
import type { JobStatus } from "@/types/database";

/**
 * Data layer for the Clips surface (GET /api/admin/clips and its first
 * server-rendered paint), mirroring the Week Board split in
 * src/lib/weeks/board-data.ts: one function, shared by the page and the
 * polling route, so the two can never drift.
 *
 * A "clip" here is a video_script content_piece created by the phone
 * upload flow (POST /api/media/register, target week_clip). Three
 * separate code paths in this repo write a content_assets row with
 * asset_metadata.type "raw_video" or "rendered_video", and only one of
 * them is this flow, so reading these rows back needs the same care the
 * writers already take to avoid claiming each other's jobs:
 *
 * - The phone-clip raw upload (src/app/api/media/register/route.ts,
 *   attachVideoToPiece) writes `file_url: null` deliberately, because a
 *   raw capture lives in the private `captures` bucket with no public
 *   URL. This is the one reliable signal that separates it from the
 *   legacy /admin/video page's own upload route
 *   (src/app/api/upload/video/route.ts), which writes the same
 *   asset_metadata.type "raw_video" but to the public `media` bucket
 *   with a real file_url and no `bucket` key. Treating that row as a
 *   raw clip here would hand /api/admin/clips/run a bucket ("captures")
 *   the file was never uploaded to.
 *
 * - The phone-clip render (the Mac worker, video_handler.py) writes
 *   asset_metadata.type "rendered_video" with an `aspect` key
 *   ("9x16" | "1x1" | "16x9"). The legacy synchronous Shotstack route
 *   (src/app/api/generate/video/route.ts) writes the same
 *   asset_metadata.type but never sets `aspect`. Presence of a
 *   non-empty `aspect` string is therefore the discriminator, matching
 *   how POST /api/admin/clips/run itself separates providers by
 *   checking `provider = "mac_engine"` on the job row rather than
 *   trusting job_type alone.
 *
 * Deliberately not filtered: the piece list itself. A video_script
 * piece produced by the legacy /admin/video page (script + b-roll, no
 * phone capture) will still appear here with rawAsset null and
 * renders []. That page is left untouched and its retirement is a
 * later decision, so this reads every video_script piece rather than
 * guessing which ones "belong" to the phone-clip flow.
 */

export interface ClipPieceSummary {
  id: string;
  title: string;
  week_id: string;
  company_id: string;
  created_at: string;
  /** Display only. Null is possible only if the week join fails to resolve. */
  week_number: number | null;
  company_name: string | null;
}

export interface ClipRawAsset {
  id: string;
  originalFilename: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  durationSeconds: number | null;
  createdAt: string;
}

export interface ClipRenderVerify {
  passed: boolean;
  failures: string[];
  caption_band?: unknown;
  bursts?: unknown;
}

export interface ClipRender {
  aspect: string;
  file_url: string;
  thumbnailUrl: string | null;
  durationSeconds: number | null;
  verify: ClipRenderVerify | null;
}

export interface ClipLatestJob {
  id: string;
  status: JobStatus;
  progress: number;
  error_message: string | null;
  output_payload: Record<string, unknown>;
  updated_at: string | null;
}

export interface ClipCard {
  piece: ClipPieceSummary;
  rawAsset: ClipRawAsset | null;
  latestJob: ClipLatestJob | null;
  renders: ClipRender[];
}

export interface SelectableWeek {
  id: string;
  company_id: string;
  week_number: number;
  title: string | null;
  company_name: string | null;
}

export interface ClipsBoardData {
  clips: ClipCard[];
  weeks: SelectableWeek[];
}

const CLIP_PIECE_LIMIT = 20;
const SELECTABLE_WEEK_LIMIT = 8;

interface PieceRow {
  id: string;
  title: string;
  week_id: string;
  company_id: string;
  created_at: string;
  week: { week_number: number } | null;
  company: { name: string } | null;
}

interface AssetRow {
  id: string;
  content_piece_id: string;
  file_url: string | null;
  asset_metadata: Record<string, unknown> | null;
  created_at: string;
}

interface JobRow {
  id: string;
  content_piece_id: string | null;
  status: JobStatus;
  progress: number;
  error_message: string | null;
  output_payload: Record<string, unknown> | null;
  updated_at: string | null;
  created_at: string;
}

interface WeekRow {
  id: string;
  company_id: string;
  week_number: number;
  title: string | null;
  company: { name: string } | null;
}

/**
 * Fetch the newest video_script pieces plus their upload/render state,
 * and a short list of weeks to upload against. Shared by the Clips page
 * (first paint) and GET /api/admin/clips (polling refresh).
 */
export async function getClipsBoardData(
  supabase: SupabaseClient
): Promise<ClipsBoardData> {
  const { data: pieceRows, error: pieceErr } = await supabase
    .from("content_pieces")
    .select(
      "id, title, week_id, company_id, created_at, week:weeks(week_number), company:companies(name)"
    )
    .eq("content_type", "video_script")
    .order("created_at", { ascending: false })
    .limit(CLIP_PIECE_LIMIT);

  if (pieceErr) throw new Error(pieceErr.message);

  const pieces = (pieceRows || []) as unknown as PieceRow[];
  const pieceIds = pieces.map((p) => p.id);

  const rawAssetsByPiece = new Map<string, ClipRawAsset>();
  const rendersByPiece = new Map<string, ClipRender[]>();
  const jobsByPiece = new Map<string, ClipLatestJob>();

  if (pieceIds.length > 0) {
    const { data: assetRows, error: assetErr } = await supabase
      .from("content_assets")
      .select("id, content_piece_id, file_url, asset_metadata, created_at")
      .in("content_piece_id", pieceIds)
      .eq("asset_type", "custom")
      .order("created_at", { ascending: true });

    if (assetErr) throw new Error(assetErr.message);

    // Ascending order, so within each piece the last row processed for a
    // given key (raw asset, or a given render aspect) is the newest one,
    // and a later Map.set for the same key naturally wins.
    for (const row of (assetRows || []) as AssetRow[]) {
      const meta = row.asset_metadata || {};

      if (meta.type === "raw_video" && row.file_url === null) {
        rawAssetsByPiece.set(row.content_piece_id, {
          id: row.id,
          originalFilename: (meta.originalFilename as string | undefined) ?? null,
          mimeType: (meta.mimeType as string | undefined) ?? null,
          sizeBytes: (meta.sizeBytes as number | undefined) ?? null,
          durationSeconds: (meta.durationSeconds as number | undefined) ?? null,
          createdAt: row.created_at,
        });
        continue;
      }

      const aspect = meta.aspect;
      if (meta.type === "rendered_video" && typeof aspect === "string" && aspect.length > 0) {
        const existing = rendersByPiece.get(row.content_piece_id) ?? [];
        const withoutThisAspect = existing.filter((r) => r.aspect !== aspect);
        withoutThisAspect.push({
          aspect,
          file_url: row.file_url as string,
          thumbnailUrl: (meta.thumbnailUrl as string | undefined) ?? null,
          durationSeconds: (meta.durationSeconds as number | undefined) ?? null,
          verify: (meta.verify as ClipRenderVerify | undefined) ?? null,
        });
        rendersByPiece.set(row.content_piece_id, withoutThisAspect);
      }
    }

    const { data: jobRows, error: jobErr } = await supabase
      .from("content_generation_jobs")
      .select(
        "id, content_piece_id, status, progress, error_message, output_payload, updated_at, created_at"
      )
      .in("content_piece_id", pieceIds)
      .eq("job_type", "video_rendering")
      .eq("provider", "mac_engine")
      .order("created_at", { ascending: false });

    if (jobErr) throw new Error(jobErr.message);

    // Descending order, so the first row seen per piece is the newest.
    for (const row of (jobRows || []) as JobRow[]) {
      if (!row.content_piece_id || jobsByPiece.has(row.content_piece_id)) continue;
      jobsByPiece.set(row.content_piece_id, {
        id: row.id,
        status: row.status,
        progress: row.progress,
        error_message: row.error_message,
        output_payload: row.output_payload || {},
        updated_at: row.updated_at,
      });
    }
  }

  const clips: ClipCard[] = pieces.map((p) => ({
    piece: {
      id: p.id,
      title: p.title,
      week_id: p.week_id,
      company_id: p.company_id,
      created_at: p.created_at,
      week_number: p.week?.week_number ?? null,
      company_name: p.company?.name ?? null,
    },
    rawAsset: rawAssetsByPiece.get(p.id) ?? null,
    latestJob: jobsByPiece.get(p.id) ?? null,
    renders: rendersByPiece.get(p.id) ?? [],
  }));

  const { data: weekRows, error: weekErr } = await supabase
    .from("weeks")
    .select("id, company_id, week_number, title, company:companies(name)")
    .order("date_start", { ascending: false })
    .limit(SELECTABLE_WEEK_LIMIT);

  if (weekErr) throw new Error(weekErr.message);

  const weeks: SelectableWeek[] = ((weekRows || []) as unknown as WeekRow[]).map((w) => ({
    id: w.id,
    company_id: w.company_id,
    week_number: w.week_number,
    title: w.title,
    company_name: w.company?.name ?? null,
  }));

  return { clips, weeks };
}
