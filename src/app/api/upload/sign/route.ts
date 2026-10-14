import { NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { authoriseCompany } from "@/lib/media/access";
import { checkQuota } from "@/lib/media/quota";
import { getEffectivePlan } from "@/lib/utils/get-effective-plan";
import { tusEndpointFor } from "@/lib/upload/tus-endpoint";
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
 * Body: { companyId, kind: "photo" | "video", filename, mimeType, sizeBytes,
 *          sha256?, resumePath? }
 * Returns: { bucket, path, token, signedUrl, tusEndpoint }
 *      or: { alreadyExists: true, photo } when sha256 is already in the library
 *      (nothing is signed and nothing needs uploading).
 *
 * Also enforced here: the company's plan storage cap. A resumable upload
 * that outlives its token (two hours) comes back with resumePath to get a
 * fresh token for the same object key.
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
  sha256?: unknown;
  resumePath?: unknown;
}

function yyyymmdd(date: Date): string {
  return date.toISOString().slice(0, 10).replace(/-/g, "");
}

function buildObjectKey(companyId: string, kind: MediaKind, filename: string): string {
  return `${companyId}/${kind}s/${yyyymmdd(new Date())}_${Date.now()}_${sanitiseFilename(filename)}`;
}

export async function POST(request: Request) {
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

  // An admin, or a member of this company. Not anyone signed in.
  const access = await authoriseCompany(companyId);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
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

  const supabase = await createAdminSupabaseClient();

  // A token for an upload already in flight: same key, new token.
  if (typeof body.resumePath === "string") {
    const resumePath = body.resumePath;
    if (!resumePath.startsWith(`${companyId}/`) || resumePath.includes("..")) {
      return NextResponse.json({ error: "resumePath must sit under the company's own folder" }, { status: 400 });
    }
    const { data: fresh, error: freshErr } = await supabase.storage
      .from(CAPTURES_BUCKET)
      .createSignedUploadUrl(resumePath);
    if (freshErr || !fresh) {
      return NextResponse.json({ error: `Could not renew the upload: ${freshErr?.message ?? "unknown error"}` }, { status: 500 });
    }
    return NextResponse.json({
      bucket: CAPTURES_BUCKET,
      path: resumePath,
      token: fresh.token,
      signedUrl: fresh.signedUrl,
      tusEndpoint: tusEndpointFor(process.env.NEXT_PUBLIC_SUPABASE_URL!),
    });
  }

  // Already in the library? Then there is nothing to upload.
  if (typeof body.sha256 === "string" && /^[0-9a-f]{64}$/i.test(body.sha256)) {
    const { data: existing } = await supabase
      .from("photo_inventory")
      .select("id, kind, original_filename, scene_label, added_at")
      .eq("company_id", companyId)
      .eq("file_ref", `sha256:${body.sha256.toLowerCase()}`)
      .maybeSingle();
    if (existing) return NextResponse.json({ alreadyExists: true, photo: existing });
  }

  // Plan storage cap. This refuses the upload; it never deletes anything.
  const [{ data: company }, usedResult] = await Promise.all([
    supabase.from("companies").select("plan, trial_plan, trial_expires_at").eq("id", companyId).maybeSingle(),
    supabase.rpc("company_media_bytes", { p_company: companyId }),
  ]);
  if (company) {
    const used = Number(usedResult.data ?? 0);
    const decision = checkQuota(used, sizeBytes, getEffectivePlan(company as Parameters<typeof getEffectivePlan>[0]));
    if (!decision.allowed) {
      return NextResponse.json({ error: decision.message, code: "library_full" }, { status: 413 });
    }
  }

  const path = buildObjectKey(companyId, kind, filename);
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
    tusEndpoint: tusEndpointFor(process.env.NEXT_PUBLIC_SUPABASE_URL!),
  });
}
