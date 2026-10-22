import { NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { companyForToken, checkAndRecordAttempt } from "@/lib/staff-upload/access";
import { CAPTURES_BUCKET, MAX_PHOTO_BYTES, PHOTO_MIME_TYPES, sanitiseFilename } from "@/lib/upload/media-constants";
import { checkQuota } from "@/lib/media/quota";
import { getEffectivePlan } from "@/lib/utils/get-effective-plan";
import type { PlanTier } from "@/types/database";

/**
 * POST /api/staff-upload/[token]/sign
 *
 * The staff upload link: no login, photos only, 25 MB each, rate limited.
 * Body: { filename, mimeType, sizeBytes, sha256? }
 * Returns a signed upload URL into the company's `staff/` folder, or
 * { alreadyExists: true } when the same photo is already in the library.
 */
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const supabase = await createAdminSupabaseClient();
  const company = await companyForToken(supabase, token);
  if (!company) return NextResponse.json({ error: "This link is not working. Ask your manager for a new one." }, { status: 404 });

  const limit = await checkAndRecordAttempt(supabase, company.id, request.headers.get("x-forwarded-for"));
  if (!limit.allowed) return NextResponse.json({ error: limit.message }, { status: 429 });

  const body = await request.json().catch(() => ({}));
  const { filename, mimeType, sizeBytes, sha256 } = body as Record<string, unknown>;
  if (typeof filename !== "string" || !filename.trim()) return NextResponse.json({ error: "filename is required" }, { status: 400 });
  const mime = typeof mimeType === "string" ? mimeType.split(";")[0].trim().toLowerCase() : "";
  if (!PHOTO_MIME_TYPES.includes(mime)) return NextResponse.json({ error: "Only photos can be added here (JPEG, PNG, WebP or iPhone photos)." }, { status: 415 });
  if (typeof sizeBytes !== "number" || !Number.isFinite(sizeBytes) || sizeBytes <= 0) return NextResponse.json({ error: "sizeBytes is required" }, { status: 400 });
  if (sizeBytes > MAX_PHOTO_BYTES) return NextResponse.json({ error: "That photo is over 25 MB." }, { status: 413 });

  if (typeof sha256 === "string" && /^[0-9a-f]{64}$/i.test(sha256)) {
    const { data: existing } = await supabase
      .from("photo_inventory")
      .select("id")
      .eq("company_id", company.id)
      .eq("file_ref", `sha256:${sha256.toLowerCase()}`)
      .maybeSingle();
    if (existing) return NextResponse.json({ alreadyExists: true });
  }

  const usedResult = await supabase.rpc("company_media_bytes", { p_company: company.id });
  const decision = checkQuota(Number(usedResult.data ?? 0), sizeBytes, getEffectivePlan({
    plan: company.plan as PlanTier,
    trial_plan: company.trial_plan as PlanTier | null,
    trial_expires_at: company.trial_expires_at,
  }));
  if (!decision.allowed) return NextResponse.json({ error: "The library is full at the moment. Please tell your manager." }, { status: 413 });

  const rand = Math.random().toString(36).slice(2, 8);
  const path = `${company.id}/staff/${new Date().toISOString().slice(0, 10).replace(/-/g, "")}_${Date.now()}_${rand}_${sanitiseFilename(filename)}`;
  const { data, error } = await supabase.storage.from(CAPTURES_BUCKET).createSignedUploadUrl(path);
  if (error || !data) return NextResponse.json({ error: "Could not start the upload. Please try again." }, { status: 500 });
  return NextResponse.json({ bucket: CAPTURES_BUCKET, path, token: data.token, signedUrl: data.signedUrl });
}
