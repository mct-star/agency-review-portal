import { NextResponse } from "next/server";
import { JoseKey } from "@atproto/oauth-client-node";
import { blueskyOAuthConfig } from "@/lib/bluesky/oauth";

/** Publishes only the public signing key required to verify this portal's Bluesky OAuth client. */
export async function GET() {
  const config = blueskyOAuthConfig();
  if (!config) return NextResponse.json({ keys: [] }, { status: 503, headers: { "Cache-Control": "no-store" } });
  try {
    const key = await JoseKey.fromJWK(config.privateJwk);
    return NextResponse.json({ keys: [key.publicJwk] }, { headers: { "Cache-Control": "public, max-age=300" } });
  } catch {
    return NextResponse.json({ keys: [] }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
