import { NextResponse } from "next/server";
import { requireCompanyUser } from "@/lib/supabase/admin";
import { createThreadsState, newThreadsNonce, THREADS_NONCE_COOKIE, threadsConfig, THREADS_SCOPES } from "@/lib/threads/oauth";

/** Starts Threads OAuth for an authenticated publisher connecting their own company account. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const companyId = url.searchParams.get("companyId");
  if (!companyId) return NextResponse.json({ error: "companyId is required" }, { status: 400 });
  const profile = await requireCompanyUser(companyId);
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (profile.role !== "admin") return NextResponse.json({ error: "Only an administrator can connect publishing accounts." }, { status: 403 });
  const config = threadsConfig();
  const secret = process.env.THREADS_APP_SECRET?.trim();
  if (!config || !secret) return NextResponse.json({ error: "Threads account connection is not configured." }, { status: 503 });
  const nonce = newThreadsNonce();
  const state = createThreadsState({ companyId, userId: profile.id, nonce, returnTo: url.searchParams.get("returnTo") === "publish" ? "publish" : "setup" }, secret);
  const auth = new URL("https://threads.net/oauth/authorize");
  auth.searchParams.set("client_id", config.appId);
  auth.searchParams.set("redirect_uri", config.redirectUri);
  auth.searchParams.set("scope", THREADS_SCOPES.join(","));
  auth.searchParams.set("response_type", "code");
  auth.searchParams.set("state", state);
  const response = NextResponse.redirect(auth);
  response.cookies.set(THREADS_NONCE_COOKIE, nonce, { httpOnly: true, secure: url.protocol === "https:", sameSite: "lax", path: "/api/auth/threads", maxAge: 600 });
  return response;
}
