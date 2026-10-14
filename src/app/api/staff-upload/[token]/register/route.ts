import { NextResponse, after } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { companyForToken, checkAndRecordAttempt } from "@/lib/staff-upload/access";
import { notifyStaffPhotosPending } from "@/lib/staff-upload/notify";
import { autoTagItem, findStoredObject, registerLibraryItem } from "@/lib/media/library";
import { CAPTURES_BUCKET, MAX_PHOTO_BYTES, PHOTO_MIME_TYPES } from "@/lib/upload/media-constants";

export const maxDuration = 60;

/**
 * POST /api/staff-upload/[token]/register
 *
 * Second half of a staff upload. The photo lands as `pending`: invisible to
 * posts until a company user approves it. What was actually stored is
 * checked (size and type), because the signed URL cannot enforce either.
 */
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const supabase = await createAdminSupabaseClient();
  const company = await companyForToken(supabase, token);
  if (!company) return NextResponse.json({ error: "This link is not working. Ask your manager for a new one." }, { status: 404 });

  const limit = await checkAndRecordAttempt(supabase, company.id, request.headers.get("x-forwarded-for"));
  if (!limit.allowed) return NextResponse.json({ error: limit.message }, { status: 429 });

  const body = await request.json().catch(() => ({}));
  const path = typeof body.path === "string" ? body.path : "";
  // Only keys this link's company could have been given, and never a path trick.
  if (!path.startsWith(`${company.id}/staff/`) || path.includes("..")) {
    return NextResponse.json({ error: "That file does not belong to this link." }, { status: 400 });
  }
  if (body.bucket !== CAPTURES_BUCKET) return NextResponse.json({ error: "Invalid upload." }, { status: 400 });

  const stored = await findStoredObject(supabase, CAPTURES_BUCKET, path);
  if (!stored) return NextResponse.json({ error: "The upload did not finish. Please try that photo again." }, { status: 404 });
  const storedMime = (stored.mimetype || "").toLowerCase();
  if ((stored.size !== null && stored.size > MAX_PHOTO_BYTES) || (storedMime && !PHOTO_MIME_TYPES.includes(storedMime))) {
    await supabase.storage.from(CAPTURES_BUCKET).remove([path]);
    return NextResponse.json({ error: "Only photos up to 25 MB can be added here." }, { status: 413 });
  }

  const sha256 = typeof body.sha256 === "string" && /^[0-9a-f]{64}$/i.test(body.sha256) ? body.sha256.toLowerCase() : null;
  const submittedBy = typeof body.submittedBy === "string" ? body.submittedBy.trim().slice(0, 60) || null : null;
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

  const result = await registerLibraryItem(supabase, {
    companyId: company.id,
    kind: "photo",
    path,
    mimeType: storedMime || "image/jpeg",
    sizeBytes: stored.size ?? (num(body.sizeBytes) || 1),
    originalFilename: typeof body.originalFilename === "string" ? body.originalFilename.slice(0, 200) : "photo.jpg",
    sha256,
    width: num(body.width),
    height: num(body.height),
    durationSeconds: null,
    source: "staff_link",
    status: "pending",
    submittedBy,
  });

  if (!result.alreadyExists) {
    const id = (result.photo as { id?: string } | null)?.id;
    after(async () => {
      if (id) await autoTagItem(supabase, id, { visionImages: result.visionImages });
      await notifyStaffPhotosPending(supabase, company.id);
    });
  }
  return NextResponse.json({ ok: true, alreadyExists: result.alreadyExists });
}
