import { NextResponse } from "next/server";
import { requireCompanyUser } from "@/lib/supabase/admin";
import { connectBlueskyAccount } from "@/lib/bluesky/connect";
import { BLUESKY_NONCE_COOKIE, BLUESKY_OAUTH_SCOPE, blueskyOAuthConfig, createBlueskyOAuthClient, createBlueskyOAuthState, newBlueskyNonce } from "@/lib/bluesky/oauth";

/** Starts signed Bluesky OAuth, or validates an explicit app-password pilot connection. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const companyId = url.searchParams.get("companyId");
  const handle = url.searchParams.get("handle")?.trim().replace(/^@/, "");
  if (!companyId || !handle) return NextResponse.json({ error: "companyId and handle are required." }, { status: 400 });
  const profile = await requireCompanyUser(companyId);
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (profile.role !== "admin") return NextResponse.json({ error: "Only an administrator can connect publishing accounts." }, { status: 403 });
  if (!blueskyOAuthConfig()) return NextResponse.json({ error: "Bluesky OAuth is not configured." }, { status: 503 });
  const nonce = newBlueskyNonce();
  const state = createBlueskyOAuthState({ companyId, userId: profile.id, nonce, returnTo: url.searchParams.get("returnTo") === "publish" ? "publish" : "setup" });
  try {
    const { client } = await createBlueskyOAuthClient({ companyId, userId: profile.id });
    const identifier = handle.includes(".") ? handle : `${handle}.bsky.social`;
    const authUrl = await client.authorize(identifier, { state, scope: BLUESKY_OAUTH_SCOPE });
    const response = NextResponse.redirect(authUrl);
    response.cookies.set(BLUESKY_NONCE_COOKIE, nonce, { httpOnly: true, secure: url.protocol === "https:", sameSite: "lax", path: "/api/auth/bluesky", maxAge: 600 });
    return response;
  } catch {
    return NextResponse.json({ error: "Bluesky could not start account authorisation." }, { status: 502 });
  }
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { companyId?: string; handle?: string; appPassword?: string } | null;
  if (!body?.companyId || !body.handle || !body.appPassword) return NextResponse.json({ error: "companyId, handle and appPassword are required." }, { status: 400 });
  const profile = await requireCompanyUser(body.companyId);
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (profile.role !== "admin") return NextResponse.json({ error: "Only an administrator can connect publishing accounts." }, { status: 403 });
  try {
    const result = await connectBlueskyAccount(body.companyId, body.handle, body.appPassword);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({ connected: true, accountName: result.handle, accountId: result.did, method: "app_password" });
  } catch {
    return NextResponse.json({ error: "Bluesky could not verify this handle and app password." }, { status: 400 });
  }
}
