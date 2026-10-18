import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createAdminSupabaseClient, getSignedInProfile, requireCompanyUser } from "@/lib/supabase/admin";
import { decryptJson, encrypt } from "@/lib/crypto";
import { hasMetaPermissions, hasMetaPublishTask, META_PENDING_COOKIE, metaConfig, metaGraph, selectMetaPage } from "@/lib/meta/oauth";

type PendingGrant = { companyId: string; userId: string; accessToken: string; expiresAt: string; grantExpiresAt: number; nonce: string };
async function pendingGrant(): Promise<PendingGrant | null> {
  const value = (await cookies()).get(META_PENDING_COOKIE)?.value;
  if (!value) return null;
  try {
    const parsed = decryptJson(value) as unknown as PendingGrant;
    if (!parsed.companyId || !parsed.userId || !parsed.accessToken || !Number.isFinite(Date.parse(parsed.expiresAt)) || Date.parse(parsed.expiresAt) <= Date.now() || !Number.isFinite(parsed.grantExpiresAt) || parsed.grantExpiresAt <= Date.now()) return null;
    const profile = await getSignedInProfile();
    const member = await requireCompanyUser(parsed.companyId);
    if (!profile || profile.id !== parsed.userId || !member || (member.role !== "admin" && !member.can_publish)) return null;
    return parsed;
  } catch { return null; }
}

async function listPages(token: string) {
  const pages: Array<Record<string, unknown>> = [];
  let after: string | undefined;
  for (let page = 0; page < 10; page++) {
    const response = await metaGraph("me/accounts", { fields: "id,name,access_token,tasks,instagram_business_account{id,username}", limit: "100", ...(after ? { after } : {}) }, token);
    if (Array.isArray(response.data)) pages.push(...response.data as Array<Record<string, unknown>>);
    const paging = response.paging as { cursors?: { after?: string }; next?: unknown } | undefined;
    const next = paging?.cursors?.after;
    if (!paging?.next) return pages;
    if (!next || typeof next !== "string" || next === after) throw new Error("Meta returned invalid Page pagination");
    after = next;
  }
  throw new Error("Too many Pages were authorised for this connection");
}

/** Lists safe Page and linked Instagram identities from the pending Meta grant. */
export async function GET(request: Request) {
  const pending = await pendingGrant();
  if (!pending) return NextResponse.json({ error: "The Meta connection expired. Start again." }, { status: 401 });
  if (new URL(request.url).searchParams.get("companyId") !== pending.companyId) return NextResponse.json({ error: "The selected company does not match this Meta connection." }, { status: 403 });
  try {
    const rows = await listPages(pending.accessToken);
    const pages = rows.filter((row) => typeof row.id === "string" && typeof row.name === "string" && typeof row.access_token === "string").map((row) => {
      const ig = row.instagram_business_account as { id?: string; username?: string } | undefined;
      return { id: row.id as string, name: row.name as string, tasks: Array.isArray(row.tasks) ? row.tasks.filter((task): task is string => typeof task === "string") : [],
        instagram: ig?.id ? { id: ig.id, username: ig.username || null } : null };
    });
    return NextResponse.json({ pages }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch { return NextResponse.json({ error: "Could not verify the Pages available to this account." }, { status: 502 }); }
}

/** Stores only the exact Page and optional linked Instagram identity chosen by the signed-in company user. */
export async function POST(request: Request) {
  const pending = await pendingGrant();
  if (!pending) return NextResponse.json({ error: "The Meta connection expired. Start again." }, { status: 401 });
  const body = await request.json().catch(() => null) as { companyId?: string; pageId?: string; instagramId?: string | null } | null;
  if (body?.companyId !== pending.companyId) return NextResponse.json({ error: "The selected company does not match this Meta connection." }, { status: 403 });
  if (!body?.pageId) return NextResponse.json({ error: "Choose a Facebook Page." }, { status: 400 });
  try {
    const pages = await listPages(pending.accessToken);
    const page = selectMetaPage(pages, body.pageId, body.instagramId);
    if (!page || typeof page.name !== "string") return NextResponse.json({ error: "That Page is not available to the signed-in Meta account." }, { status: 403 });
    const tasks = Array.isArray(page.tasks) ? page.tasks.filter((task): task is string => typeof task === "string") : [];
    if (!hasMetaPublishTask(tasks)) return NextResponse.json({ error: "This Meta account cannot publish to the selected Page." }, { status: 403 });
    const linkedIg = page.instagram_business_account as { id?: string; username?: string } | undefined;
    if (body.instagramId && body.instagramId !== linkedIg?.id) return NextResponse.json({ error: "Choose the Instagram account linked to this Page." }, { status: 400 });
    if (body.instagramId) {
      const grants = await metaGraph("me/permissions", { fields: "permission,status" }, pending.accessToken);
      const scopes = Array.isArray(grants.data) ? grants.data as Array<{ permission?: string; status?: string }> : [];
      if (!hasMetaPermissions(scopes, true)) return NextResponse.json({ error: "Meta did not grant the Instagram publishing permissions." }, { status: 403 });
    }
    const pageToken = page.access_token as string;
    const config = metaConfig();
    if (!config) return NextResponse.json({ error: "Meta publishing is not configured." }, { status: 503 });
    const debug = await metaGraph("debug_token", { input_token: pageToken }, pending.accessToken);
    const debugData = debug.data as { app_id?: string; is_valid?: boolean; expires_at?: number; data_access_expires_at?: number } | undefined;
    if (!debugData?.is_valid || debugData.app_id !== config.appId || (debugData.expires_at && debugData.expires_at * 1000 <= Date.now()) || (debugData.data_access_expires_at && debugData.data_access_expires_at * 1000 <= Date.now())) {
      return NextResponse.json({ error: "Meta could not validate the selected Page grant." }, { status: 400 });
    }
    const verifiedPage = await metaGraph(body.pageId, { fields: "id,name" }, pageToken);
    if (verifiedPage.id !== body.pageId) return NextResponse.json({ error: "Meta could not verify the selected Page." }, { status: 400 });
    const metadata = { connected_by: pending.userId, page_id: body.pageId, instagram_id: body.instagramId || null, source: "meta-facebook-login-v1" };
    const supabase = await createAdminSupabaseClient();
    const expirySeconds = [debugData.expires_at, debugData.data_access_expires_at].filter((value): value is number => typeof value === "number" && Number.isFinite(value) && value > 0);
    const expiry = expirySeconds.length ? new Date(Math.min(...expirySeconds) * 1000).toISOString() : null;
    const rows = [{ company_id: pending.companyId, platform: "facebook", account_name: page.name, account_id: body.pageId, access_token_encrypted: encrypt(pageToken),
      refresh_token_encrypted: null, token_expires_at: expiry, platform_metadata: metadata, is_active: true }];
    if (body.instagramId && linkedIg?.id) rows.push({ company_id: pending.companyId, platform: "instagram", account_name: linkedIg.username ? `@${linkedIg.username}` : `Instagram ${linkedIg.id}`,
      account_id: linkedIg.id, access_token_encrypted: encrypt(pageToken), refresh_token_encrypted: null, token_expires_at: expiry, platform_metadata: metadata, is_active: true });
    const { error } = await supabase.from("company_social_accounts").upsert(rows, { onConflict: "company_id,platform,account_id" });
    if (error) return NextResponse.json({ error: "Could not save the selected Meta account." }, { status: 500 });
    const result = NextResponse.json({ connected: true, pageName: page.name, instagramName: body.instagramId && linkedIg?.username ? `@${linkedIg.username}` : null });
    result.cookies.set(META_PENDING_COOKIE, "", { httpOnly: true, secure: new URL(request.url).protocol === "https:", sameSite: "lax", path: "/api/auth/meta", maxAge: 0 });
    return result;
  } catch { return NextResponse.json({ error: "Meta could not verify the selected Page. Start the connection again." }, { status: 502 }); }
}
