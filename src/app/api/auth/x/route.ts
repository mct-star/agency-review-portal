import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabaseClient, requireAdmin } from "@/lib/supabase/admin";
import { getXAuthorizationUrl, makeXNonce, makeXVerifier, signXState, X_STATE_COOKIE, xClientId, xClientSecret, xRedirectUri } from "@/lib/x/oauth";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Starts a signed, browser-bound X user authorisation for one company. Only signed-in admins may call it. */
export async function GET(request: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams, origin } = new URL(request.url);
  const companyId = searchParams.get("companyId") || "";
  if (!UUID.test(companyId)) return NextResponse.json({ error: "A valid companyId is required" }, { status: 400 });

  const supabase = await createAdminSupabaseClient();
  const { data: company } = await supabase.from("companies").select("id").eq("id", companyId).maybeSingle();
  if (!company) return NextResponse.json({ error: "Company not found" }, { status: 404 });

  const clientId = xClientId();
  const clientSecret = xClientSecret();
  if (!clientId || !clientSecret) return NextResponse.json({ error: "X direct publishing is not configured" }, { status: 503 });

  const nonce = makeXNonce();
  const verifier = makeXVerifier();
  const returnTo = searchParams.get("returnTo") === "publish" ? "publish" : "setup";
  const state = signXState({ companyId, userId: admin.id, returnTo, nonce }, clientSecret);
  const redirectUri = xRedirectUri(origin);
  const response = NextResponse.redirect(getXAuthorizationUrl(clientId, redirectUri, state, verifier));
  response.cookies.set(X_STATE_COOKIE, `${nonce}.${verifier}`, {
    httpOnly: true,
    secure: new URL(redirectUri).protocol === "https:",
    sameSite: "lax",
    path: "/api/auth/x/callback",
    maxAge: 600,
  });
  return response;
}
