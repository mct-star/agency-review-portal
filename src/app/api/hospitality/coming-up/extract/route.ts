import { NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { authoriseCompany } from "@/lib/media/access";
import { extractUpcoming, MAX_UPLOAD_BYTES, UploadError } from "@/lib/hospitality/coming-up-extract";
import { requireVenue } from "@/lib/hospitality/coming-up-store";
import { todayIn } from "@/lib/hospitality/week";

export const maxDuration = 60;

/**
 * POST /api/hospitality/coming-up/extract
 * multipart: file (a PDF, a photo, or an .ics calendar), companyId
 *
 * Reads what is coming up from the upload and returns it for the person to
 * tick. Saves nothing: POST /api/hospitality/coming-up/confirm does that.
 */
export async function POST(request: Request) {
  const form = await request.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Choose a file to upload." }, { status: 400 });
  const companyId = form.get("companyId");
  const access = await authoriseCompany(companyId);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  const supabase = await createAdminSupabaseClient();
  const venue = await requireVenue(supabase, companyId as string);
  if (venue instanceof NextResponse) return venue;

  const file = form.get("file");
  if (!(file instanceof Blob) || file.size === 0) return NextResponse.json({ error: "Choose a file to upload." }, { status: 400 });
  if (file.size > MAX_UPLOAD_BYTES) return NextResponse.json({ error: "That file is too big. Keep it under 4 MB." }, { status: 413 });

  const timeZone = venue.timezone || "Europe/London";
  const today = todayIn(timeZone);
  try {
    const result = await extractUpcoming(
      { name: (file as File).name || "upload", type: file.type || "", bytes: Buffer.from(await file.arrayBuffer()) },
      { companyId: companyId as string, venueName: venue.name, today, timeZone }
    );
    return NextResponse.json({ today, found: result.items, notes: result.notes });
  } catch (err) {
    if (err instanceof UploadError) return NextResponse.json({ error: err.message }, { status: 400 });
    console.error("[coming-up] extract failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "We could not read that just now. Please try again." }, { status: 502 });
  }
}
