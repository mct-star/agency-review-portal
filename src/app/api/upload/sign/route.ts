import { NextResponse } from "next/server";
import { requireAdmin, createAdminSupabaseClient } from "@/lib/supabase/admin";
import {
  CAPTURES_BUCKET,
  HEIC_MIME_TYPES,
  allowedMimeTypes,
  isMediaKind,
  maxBytes,
  sanitiseFilename,
  type MediaKind,
} from "@/lib/upload/media-constants";

/**
 * POST /api/upload/sign
 *
 * Mints a signed upload URL so the browser can PUT the file straight
 * at Supabase Storage. Nothing about this route touches the file.
 *
 * That is the whole point. Every other upload path in this codebase
 * proxies multipart through the function, and Vercel rejects a
 * request body over 4.5MB before any handler runs, so a phone clip
 * cannot get through them in production at any size worth filming.
 * Here the function only decides whether the upload is allowed and
 * where it goes.
 *
 * Body: { companyId, kind: "photo" | "video", filename, mimeType, sizeBytes }
 * Returns: { bucket, path, token, signedUrl }
 *
 * The signed URL is valid for two hours and carries its own token in
 * the query string, so the browser needs no Supabase credentials.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface SignRequestBody {
  companyId?: unknown;
  kind?: unknown;
  filename?: unknown;
  mimeType?: unknown;
  sizeBytes?: unknown;
}

function yyyymmdd(date: Date): string {
  return date.toISOString().slice(0, 10).replace(/-/g, "");
}

function buildObjectKey(companyId: string, kind: MediaKind, filename: string): string {
  return `${companyId}/${kind}s/${yyyymmdd(new Date())}_${Date.now()}_${sanitiseFilename(filename)}`;
}

export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: SignRequestBody;
  try {
    body = (await request.json()) as SignRequestBody;
  } catch {
    return NextResponse.json({ error: "Body must be JSON" }, { status: 400 });
  }

  const { companyId, kind, filename, mimeType, sizeBytes } = body;

  if (typeof companyId !== "string" || !UUID_RE.test(companyId)) {
    return NextResponse.json(
      { error: "companyId is required and must be a uuid" },
      { status: 400 }
    );
  }

  if (!isMediaKind(kind)) {
    return NextResponse.json(
      { error: 'kind is required and must be "photo" or "video"' },
      { status: 400 }
    );
  }

  if (typeof filename !== "string" || filename.trim().length === 0) {
    return NextResponse.json({ error: "filename is required" }, { status: 400 });
  }

  if (typeof mimeType !== "string" || mimeType.trim().length === 0) {
    return NextResponse.json({ error: "mimeType is required" }, { status: 400 });
  }

  if (typeof sizeBytes !== "number" || !Number.isFinite(sizeBytes) || sizeBytes <= 0) {
    return NextResponse.json(
      { error: "sizeBytes is required and must be a positive number" },
      { status: 400 }
    );
  }

  const normalisedMime = mimeType.split(";")[0].trim().toLowerCase();

  if (HEIC_MIME_TYPES.includes(normalisedMime)) {
    return NextResponse.json(
      {
        error:
          "HEIC and HEIF files cannot be processed. On iPhone, either share the photo as JPEG when you send it, or set Settings, Camera, Formats to Most Compatible and reshoot.",
      },
      { status: 415 }
    );
  }

  const allowed = allowedMimeTypes(kind);
  if (!allowed.includes(normalisedMime)) {
    return NextResponse.json(
      {
        error: `Unsupported ${kind} type: ${normalisedMime}. Allowed: ${allowed.join(", ")}`,
      },
      { status: 415 }
    );
  }

  const cap = maxBytes(kind);
  if (sizeBytes > cap) {
    return NextResponse.json(
      {
        error: `File too large (${(sizeBytes / 1024 / 1024).toFixed(1)} MB). Max for a ${kind}: ${(
          cap /
          1024 /
          1024
        ).toFixed(0)} MB`,
      },
      { status: 413 }
    );
  }

  const path = buildObjectKey(companyId, kind, filename);

  const supabase = await createAdminSupabaseClient();
  const { data, error } = await supabase.storage
    .from(CAPTURES_BUCKET)
    .createSignedUploadUrl(path);

  if (error || !data) {
    return NextResponse.json(
      { error: `Could not mint upload URL: ${error?.message ?? "unknown error"}` },
      { status: 500 }
    );
  }

  return NextResponse.json({
    bucket: CAPTURES_BUCKET,
    path,
    token: data.token,
    signedUrl: data.signedUrl,
  });
}
