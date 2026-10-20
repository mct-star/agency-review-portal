import { NextResponse } from "next/server";
import { requireCompanyUser } from "@/lib/supabase/admin";
import { refuseHospitality } from "@/lib/hospitality/pack-guard";
import { isOurStorageUrl } from "@/lib/media/our-storage-url";

/** Blocks legacy immediate Bluesky posts so every new post uses the approved publishing queue. */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body?.companyId) return NextResponse.json({ error: "companyId is required" }, { status: 400 });
  const user = await requireCompanyUser(body.companyId);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const refused = await refuseHospitality(user, body.companyId);
  if (refused) return refused;
  if (user.role !== "admin" && !user.can_publish) return NextResponse.json({ error: "Your account cannot publish." }, { status: 403 });
  if (body.imageUrl && !isOurStorageUrl(body.imageUrl)) return NextResponse.json({ error: "Choose an image from this platform's storage." }, { status: 400 });
  return NextResponse.json({ error: "Immediate Bluesky publishing is disabled. Approve the content and queue it from Publish." }, { status: 410 });
}
