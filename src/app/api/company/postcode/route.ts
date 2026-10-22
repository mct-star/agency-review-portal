import { NextResponse } from "next/server";
import { getSignedInProfile } from "@/lib/supabase/admin";
import { normalisePostcode } from "@/lib/hospitality/settings";

/**
 * GET /api/company/postcode?postcode=GL7%205TH
 *
 * Turns a UK postcode into a position for the weather post, using the public
 * postcode lookup (free, no key). Signed-in users only. The person confirms
 * the position before it is saved; nothing is stored here.
 */
export async function GET(request: Request) {
  const profile = await getSignedInProfile();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const raw = new URL(request.url).searchParams.get("postcode") || "";
  const postcode = normalisePostcode(raw);
  if (!postcode) return NextResponse.json({ error: "That does not look like a UK postcode" }, { status: 400 });

  try {
    const res = await fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(postcode.replace(" ", ""))}`, { headers: { Accept: "application/json" } });
    if (res.status === 404) return NextResponse.json({ error: "We could not find that postcode" }, { status: 404 });
    if (!res.ok) return NextResponse.json({ error: "The postcode lookup is not answering. Try again in a minute." }, { status: 502 });
    const json = (await res.json()) as { result?: { postcode?: string; latitude?: number | null; longitude?: number | null; admin_district?: string | null } };
    const r = json.result;
    if (!r || typeof r.latitude !== "number" || typeof r.longitude !== "number") {
      return NextResponse.json({ error: "That postcode has no position on record" }, { status: 404 });
    }
    return NextResponse.json({ postcode: r.postcode || postcode, latitude: r.latitude, longitude: r.longitude, area: r.admin_district ?? null });
  } catch {
    return NextResponse.json({ error: "The postcode lookup is not answering. Try again in a minute." }, { status: 502 });
  }
}
