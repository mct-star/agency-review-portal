import { NextResponse } from "next/server";
import { requireAdmin, createAdminSupabaseClient } from "@/lib/supabase/admin";
import {
  CAPTURES_BUCKET,
  PUBLISHED_BUCKET,
  allowedMimeTypes,
  isMediaKind,
  maxBytes,
  type MediaKind,
} from "@/lib/upload/media-constants";
import { copyToPublishedBucket, nextImageSortOrder } from "@/lib/media/publish-copy";

/**
 * POST /api/media/register
 *
 * Second half of the browser-direct upload. The file is already in
 * the private `captures` bucket by the time this runs; this route
 * decides what the file now means and writes the rows that make it
 * findable.
 *
 * Register is separate from sign because the upload happens outside
 * the function. Nothing but the object itself proves the upload
 * finished, so this route verifies the object exists before writing
 * a single row. A row pointing at a key that is not there is worse
 * than no row.
 *
 * Anything destined for a post is copied out of `captures` and into
 * the public `content-assets` bucket here, so content_images.public_url
 * stays a permanent public URL. Nothing downstream should ever have
 * to hold a signed URL or reason about an expiry.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHA256_RE = /^[0-9a-f]{64}$/i;

const PHOTO_SOURCES = ["photo_pack", "weekly_capture", "shoot", "bank_upload"] as const;
type PhotoSource = (typeof PHOTO_SOURCES)[number];

type RegisterTarget =
  | { type: "photo_bank"; source?: PhotoSource; sceneLabel?: string | null }
  | { type: "content_piece"; contentPieceId: string }
  | { type: "week_clip"; weekId: string };

interface RegisterBody {
  companyId: string;
  kind: MediaKind;
  bucket: string;
  path: string;
  mimeType: string;
  sizeBytes: number;
  originalFilename: string;
  sha256: string | null;
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
  weekNumber: number | null;
  target: RegisterTarget;
}

class BadRequest extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

type SupabaseAdmin = Awaited<ReturnType<typeof createAdminSupabaseClient>>;

function optionalNumber(value: unknown, field: string): number | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new BadRequest(`${field} must be a number`);
  }
  return value;
}

function parseTarget(raw: unknown): RegisterTarget {
  if (typeof raw !== "object" || raw === null) {
    throw new BadRequest("target is required");
  }
  const target = raw as Record<string, unknown>;

  switch (target.type) {
    case "photo_bank": {
      if (target.source !== undefined && !PHOTO_SOURCES.includes(target.source as PhotoSource)) {
        throw new BadRequest(`target.source must be one of: ${PHOTO_SOURCES.join(", ")}`);
      }
      if (target.sceneLabel !== undefined && target.sceneLabel !== null && typeof target.sceneLabel !== "string") {
        throw new BadRequest("target.sceneLabel must be a string");
      }
      return {
        type: "photo_bank",
        source: (target.source as PhotoSource | undefined) ?? "weekly_capture",
        sceneLabel: (target.sceneLabel as string | undefined) ?? null,
      };
    }
    case "content_piece": {
      if (typeof target.contentPieceId !== "string" || !UUID_RE.test(target.contentPieceId)) {
        throw new BadRequest("target.contentPieceId must be a uuid");
      }
      return { type: "content_piece", contentPieceId: target.contentPieceId };
    }
    case "week_clip": {
      if (typeof target.weekId !== "string" || !UUID_RE.test(target.weekId)) {
        throw new BadRequest("target.weekId must be a uuid");
      }
      return { type: "week_clip", weekId: target.weekId };
    }
    default:
      throw new BadRequest(
        'target.type must be one of: "photo_bank", "content_piece", "week_clip"'
      );
  }
}

function parseBody(raw: unknown): RegisterBody {
  if (typeof raw !== "object" || raw === null) {
    throw new BadRequest("Body must be a JSON object");
  }
  const body = raw as Record<string, unknown>;

  if (typeof body.companyId !== "string" || !UUID_RE.test(body.companyId)) {
    throw new BadRequest("companyId is required and must be a uuid");
  }
  if (!isMediaKind(body.kind)) {
    throw new BadRequest('kind is required and must be "photo" or "video"');
  }
  if (body.bucket !== CAPTURES_BUCKET) {
    throw new BadRequest(`bucket must be "${CAPTURES_BUCKET}"`);
  }
  if (typeof body.path !== "string" || body.path.trim().length === 0 || body.path.includes("..")) {
    throw new BadRequest("path is required and must be a plain object key");
  }
  if (typeof body.mimeType !== "string") {
    throw new BadRequest("mimeType is required");
  }

  const mimeType = body.mimeType.split(";")[0].trim().toLowerCase();
  const allowed = allowedMimeTypes(body.kind);
  if (!allowed.includes(mimeType)) {
    throw new BadRequest(
      `Unsupported ${body.kind} type: ${mimeType}. Allowed: ${allowed.join(", ")}`,
      415
    );
  }

  if (typeof body.sizeBytes !== "number" || !Number.isFinite(body.sizeBytes) || body.sizeBytes <= 0) {
    throw new BadRequest("sizeBytes is required and must be a positive number");
  }
  if (body.sizeBytes > maxBytes(body.kind)) {
    throw new BadRequest(`File exceeds the ${body.kind} size limit`, 413);
  }
  if (typeof body.originalFilename !== "string" || body.originalFilename.trim().length === 0) {
    throw new BadRequest("originalFilename is required");
  }
  if (body.sha256 !== undefined && body.sha256 !== null) {
    if (typeof body.sha256 !== "string" || !SHA256_RE.test(body.sha256)) {
      throw new BadRequest("sha256 must be 64 hex characters");
    }
  }

  return {
    companyId: body.companyId,
    kind: body.kind,
    bucket: CAPTURES_BUCKET,
    path: body.path,
    mimeType,
    sizeBytes: body.sizeBytes,
    originalFilename: body.originalFilename,
    sha256: (body.sha256 as string | undefined) ?? null,
    width: optionalNumber(body.width, "width"),
    height: optionalNumber(body.height, "height"),
    durationSeconds: optionalNumber(body.durationSeconds, "durationSeconds"),
    weekNumber: optionalNumber(body.weekNumber, "weekNumber"),
    target: parseTarget(body.target),
  };
}

/**
 * The object is the only proof the browser upload succeeded, so it is
 * checked before anything is written. `list` is scoped to the parent
 * prefix and `search` is a prefix match rather than an exact one,
 * hence the explicit name comparison.
 */
async function objectExists(
  supabase: SupabaseAdmin,
  bucket: string,
  path: string
): Promise<boolean> {
  const lastSlash = path.lastIndexOf("/");
  const prefix = lastSlash === -1 ? "" : path.slice(0, lastSlash);
  const basename = path.slice(lastSlash + 1);

  const { data, error } = await supabase.storage
    .from(bucket)
    .list(prefix, { limit: 100, search: basename });

  if (error || !data) return false;
  return data.some((entry) => entry.name === basename);
}

/**
 * A photo used in a post should stop counting as unused supply. The
 * append is conditional because used_in_weeks drives the tier
 * decision and a duplicate week number would misreport it.
 */
async function markPhotoUsedInWeek(
  supabase: SupabaseAdmin,
  companyId: string,
  fileRef: string,
  weekNumber: number
): Promise<void> {
  const { data: photo } = await supabase
    .from("photo_inventory")
    .select("id, used_in_weeks")
    .eq("company_id", companyId)
    .eq("file_ref", fileRef)
    .maybeSingle();

  if (!photo) return;

  const used: number[] = photo.used_in_weeks ?? [];
  if (used.includes(weekNumber)) return;

  await supabase
    .from("photo_inventory")
    .update({ used_in_weeks: [...used, weekNumber] })
    .eq("id", photo.id);
}

async function registerPhotoInBank(supabase: SupabaseAdmin, body: RegisterBody) {
  if (body.target.type !== "photo_bank") throw new BadRequest("Unreachable target");
  // The bank holds photos and video footage alike.

  const fileRef = body.sha256 ? `sha256:${body.sha256}` : body.path;

  const { data, error } = await supabase
    .from("photo_inventory")
    .insert({
      company_id: body.companyId,
      file_ref: fileRef,
      scene_label: body.target.sceneLabel ?? null,
      source: body.target.source ?? "weekly_capture",
      storage_path: body.path,
      bucket: body.bucket,
      mime_type: body.mimeType,
      width: body.width,
      height: body.height,
      size_bytes: body.sizeBytes,
      original_filename: body.originalFilename,
      kind: body.kind,
      duration_seconds: body.durationSeconds,
    })
    .select("*")
    .single();

  if (error) {
    // 23505 on (company_id, file_ref) means the content hash has been
    // registered before. That is the dedupe doing its job, not a
    // failure, so the caller gets the existing row and a 200.
    if (error.code === "23505") {
      const { data: existing } = await supabase
        .from("photo_inventory")
        .select("*")
        .eq("company_id", body.companyId)
        .eq("file_ref", fileRef)
        .maybeSingle();

      return NextResponse.json({ alreadyExists: true, photo: existing }, { status: 200 });
    }
    return NextResponse.json(
      { error: `Could not register photo: ${error.message}` },
      { status: 500 }
    );
  }

  return NextResponse.json({ alreadyExists: false, photo: data });
}

async function attachPhotoToPiece(
  supabase: SupabaseAdmin,
  body: RegisterBody,
  contentPieceId: string
) {
  const { data: piece } = await supabase
    .from("content_pieces")
    .select("id, company_id")
    .eq("id", contentPieceId)
    .maybeSingle();

  if (!piece) {
    return NextResponse.json({ error: "Content piece not found" }, { status: 404 });
  }
  if (piece.company_id !== body.companyId) {
    return NextResponse.json(
      { error: "Content piece belongs to a different company" },
      { status: 400 }
    );
  }

  const filename = body.path.slice(body.path.lastIndexOf("/") + 1);
  const publishedPath = `images/${body.companyId}/${contentPieceId}/${filename}`;

  let copyMethod: "copy" | "download_upload";
  try {
    copyMethod = await copyToPublishedBucket(supabase, body.path, publishedPath, body.mimeType);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Copy failed" },
      { status: 500 }
    );
  }

  const { data: urlData } = supabase.storage.from(PUBLISHED_BUCKET).getPublicUrl(publishedPath);
  const sortOrder = await nextImageSortOrder(supabase, contentPieceId);

  const { data: image, error: imageErr } = await supabase
    .from("content_images")
    .insert({
      content_piece_id: contentPieceId,
      filename,
      storage_path: publishedPath,
      public_url: urlData.publicUrl,
      archetype: "uploaded",
      dimensions: body.width && body.height ? `${body.width}x${body.height}` : null,
      sort_order: sortOrder,
    })
    .select("*")
    .single();

  if (imageErr) {
    return NextResponse.json(
      { error: `Could not record image: ${imageErr.message}` },
      { status: 500 }
    );
  }

  if (body.weekNumber !== null) {
    const fileRef = body.sha256 ? `sha256:${body.sha256}` : body.path;
    await markPhotoUsedInWeek(supabase, body.companyId, fileRef, body.weekNumber);
  }

  return NextResponse.json({
    contentPieceId,
    contentImageId: image.id,
    publicUrl: urlData.publicUrl,
    storagePath: publishedPath,
    copyMethod,
  });
}

/**
 * Raw video stays in `captures`. file_url is null precisely because
 * there is no public URL to hand out, which is how a consumer tells a
 * raw clip apart from a rendered asset without reading the metadata.
 */
async function attachVideoToPiece(
  supabase: SupabaseAdmin,
  body: RegisterBody,
  contentPieceId: string,
  createdPiece: boolean
) {
  if (!createdPiece) {
    const { data: piece } = await supabase
      .from("content_pieces")
      .select("id, company_id")
      .eq("id", contentPieceId)
      .maybeSingle();

    if (!piece) {
      return NextResponse.json({ error: "Content piece not found" }, { status: 404 });
    }
    if (piece.company_id !== body.companyId) {
      return NextResponse.json(
        { error: "Content piece belongs to a different company" },
        { status: 400 }
      );
    }
  }

  const { data: asset, error: assetErr } = await supabase
    .from("content_assets")
    .insert({
      content_piece_id: contentPieceId,
      asset_type: "custom",
      file_url: null,
      storage_path: body.path,
      asset_metadata: {
        type: "raw_video",
        bucket: body.bucket,
        mimeType: body.mimeType,
        sizeBytes: body.sizeBytes,
        originalFilename: body.originalFilename,
        durationSeconds: body.durationSeconds,
      },
      sort_order: 0,
    })
    .select("*")
    .single();

  if (assetErr) {
    return NextResponse.json(
      { error: `Could not record video asset: ${assetErr.message}` },
      { status: 500 }
    );
  }

  return NextResponse.json({
    contentPieceId,
    contentAssetId: asset.id,
    storagePath: body.path,
    createdContentPiece: createdPiece,
  });
}

async function createClipPiece(supabase: SupabaseAdmin, body: RegisterBody, weekId: string) {
  const { data: week } = await supabase
    .from("weeks")
    .select("id, company_id")
    .eq("id", weekId)
    .maybeSingle();

  if (!week) {
    return { error: NextResponse.json({ error: "Week not found" }, { status: 404 }) };
  }
  if (week.company_id !== body.companyId) {
    return {
      error: NextResponse.json(
        { error: "Week belongs to a different company" },
        { status: 400 }
      ),
    };
  }

  const { data: piece, error } = await supabase
    .from("content_pieces")
    .insert({
      week_id: weekId,
      company_id: body.companyId,
      content_type: "video_script",
      title: `Clip ${new Date().toISOString().slice(0, 10)}`,
      // markdown_body is NOT NULL from 001 and there is no script yet.
      // Empty is the honest value; inventing placeholder copy would
      // put words into the review queue that nobody wrote.
      markdown_body: "",
    })
    .select("id")
    .single();

  if (error || !piece) {
    return {
      error: NextResponse.json(
        { error: `Could not create clip piece: ${error?.message ?? "unknown error"}` },
        { status: 500 }
      ),
    };
  }

  return { contentPieceId: piece.id as string };
}

export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: RegisterBody;
  try {
    body = parseBody(await request.json());
  } catch (err) {
    if (err instanceof BadRequest) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: "Body must be JSON" }, { status: 400 });
  }

  const supabase = await createAdminSupabaseClient();

  if (!(await objectExists(supabase, body.bucket, body.path))) {
    return NextResponse.json(
      { error: `No object at ${body.bucket}/${body.path}. The upload did not complete.` },
      { status: 404 }
    );
  }

  try {
    switch (body.target.type) {
      case "photo_bank":
        return await registerPhotoInBank(supabase, body);

      case "content_piece":
        return body.kind === "photo"
          ? await attachPhotoToPiece(supabase, body, body.target.contentPieceId)
          : await attachVideoToPiece(supabase, body, body.target.contentPieceId, false);

      case "week_clip": {
        if (body.kind !== "video") {
          return NextResponse.json(
            { error: "target week_clip only accepts kind video" },
            { status: 400 }
          );
        }
        const created = await createClipPiece(supabase, body, body.target.weekId);
        if ("error" in created) return created.error;
        return await attachVideoToPiece(supabase, body, created.contentPieceId, true);
      }
    }
  } catch (err) {
    if (err instanceof BadRequest) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Registration failed" },
      { status: 500 }
    );
  }
}
