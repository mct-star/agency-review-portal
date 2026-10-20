import { NextResponse } from "next/server";
import { blueskyClientMetadata } from "@/lib/bluesky/oauth";

/** Publishes the AT Protocol OAuth client metadata document fetched by Bluesky identity providers. */
export async function GET() {
  const metadata = blueskyClientMetadata();
  if (!metadata) return NextResponse.json({ error: "Bluesky OAuth is not configured." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  return NextResponse.json(metadata, { headers: { "Cache-Control": "public, max-age=300" } });
}
