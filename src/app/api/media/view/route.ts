import { NextResponse } from "next/server";
import { requireAdmin, createAdminSupabaseClient } from "@/lib/supabase/admin";
import { CAPTURES_BUCKET } from "@/lib/upload/media-constants";

/**
 * GET /api/media/view?bucket=captures&path=...
 *
 * Mints a one hour signed URL for a private capture.
 *
 * Only `captures` is served here. `content-assets` and `media` are
 * public buckets with permanent URLs and need no minting, so a
 * request naming either of them is a caller bug rather than a case
 * to handle quietly.
 *
 * One hour is long enough to review a clip and short enough that a
 * URL pasted into Slack stops working before it becomes a permanent
 * copy of raw footage.
 */

const SIGNED_URL_TTL_SECONDS = 3600;

export async function GET(request: Request) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const bucket = searchParams.get("bucket");
  const path = searchParams.get("path");

  if (bucket !== CAPTURES_BUCKET) {
    return NextResponse.json(
      { error: `bucket must be "${CAPTURES_BUCKET}". Public buckets need no signed URL.` },
      { status: 400 }
    );
  }

  if (!path || path.trim().length === 0 || path.includes("..")) {
    return NextResponse.json(
      { error: "path is required and must be a plain object key" },
      { status: 400 }
    );
  }

  const supabase = await createAdminSupabaseClient();
  const { data, error } = await supabase.storage
    .from(CAPTURES_BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);

  if (error || !data) {
    return NextResponse.json(
      { error: `No object at ${CAPTURES_BUCKET}/${path}` },
      { status: 404 }
    );
  }

  return NextResponse.json({ url: data.signedUrl, expiresIn: SIGNED_URL_TTL_SECONDS });
}
