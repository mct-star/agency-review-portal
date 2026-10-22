import { NextResponse } from "next/server";
import { requireCompanyUser } from "@/lib/supabase/admin";
import { createMetaState, metaConfig, META_SCOPES, META_NONCE_COOKIE, randomMetaNonce } from "@/lib/meta/oauth";

/** Starts Meta Facebook Login for an authorised member connecting their own company's Page. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const companyId = url.searchParams.get("companyId");
  if (!companyId) return NextResponse.json({ error: "companyId is required" }, { status: 400 });
  const profile = await requireCompanyUser(companyId);
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (profile.role !== "admin" && !profile.can_publish) return NextResponse.json({ error: "Your account cannot publish." }, { status: 403 });
  const config = metaConfig();
  if (!config) return NextResponse.json({ error: "Meta publishing is not configured for this portal." }, { status: 503 });
  const nonce = randomMetaNonce();
  const state = createMetaState({ companyId, userId: profile.id, nonce, returnTo: url.searchParams.get("returnTo") === "publish" ? "publish" : "setup" });
  const auth = new URL(`https://www.facebook.com/${config.version}/dialog/oauth`);
  auth.searchParams.set("client_id", config.appId);
  auth.searchParams.set("redirect_uri", config.redirectUri);
  auth.searchParams.set("state", state);
  auth.searchParams.set("response_type", "code");
  if (config.loginConfigId) auth.searchParams.set("config_id", config.loginConfigId);
  else auth.searchParams.set("scope", META_SCOPES.join(","));
  const response = NextResponse.redirect(auth);
  response.cookies.set(META_NONCE_COOKIE, nonce, { httpOnly: true, secure: url.protocol === "https:", sameSite: "lax", path: "/api/auth/meta", maxAge: 600 });
  return response;
}
