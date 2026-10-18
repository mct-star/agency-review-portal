import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const META_OAUTH_TTL_SECONDS = 10 * 60;
export const META_PENDING_COOKIE = "meta_pending_grant";
export const META_NONCE_COOKIE = "meta_oauth_nonce";
export const META_SCOPES = ["pages_show_list", "pages_read_engagement", "pages_manage_posts", "instagram_basic", "instagram_content_publish"] as const;

export function hasMetaPermissions(rows: Array<{ permission?: string; status?: string }>, includeInstagram = false) {
  const required = ["pages_show_list", "pages_read_engagement", "pages_manage_posts", ...(includeInstagram ? ["instagram_basic", "instagram_content_publish"] : [])];
  return required.every((name) => rows.some((row) => row.permission === name && row.status === "granted"));
}

export function selectMetaPage<T extends { id?: unknown; name?: unknown; access_token?: unknown; instagram_business_account?: unknown }>(rows: T[], pageId: string, instagramId?: string | null): T | null {
  const page = rows.find((row) => row.id === pageId && typeof row.name === "string" && typeof row.access_token === "string");
  if (!page) return null;
  const instagram = page.instagram_business_account as { id?: string } | undefined;
  return instagramId && instagram?.id !== instagramId ? null : page;
}

export type MetaState = { companyId: string; userId: string; nonce: string; exp: number };
const stateKey = () => (process.env.META_APP_SECRET || "").trim();

export function metaConfig(env: Record<string, string | undefined> = process.env) {
  const appId = env.META_APP_ID?.trim();
  const appSecret = env.META_APP_SECRET?.trim();
  const redirectUri = env.META_REDIRECT_URI?.trim();
  const version = env.META_GRAPH_API_VERSION?.trim();
  const loginConfigId = env.META_LOGIN_CONFIG_ID?.trim() || undefined;
  return appId && appSecret && redirectUri && /^v\d+\.\d+$/.test(version || "")
    ? { appId, appSecret, redirectUri, version: version!, loginConfigId }
    : null;
}

export function randomMetaNonce() { return randomBytes(24).toString("base64url"); }
function sign(message: string) { return createHmac("sha256", stateKey()).update(message).digest("base64url"); }

export function createMetaState(value: Omit<MetaState, "exp">, now = Date.now()) {
  const payload = Buffer.from(JSON.stringify({ ...value, exp: Math.floor(now / 1000) + META_OAUTH_TTL_SECONDS })).toString("base64url");
  const body = `meta-v1.${payload}`;
  return `${body}.${sign(body)}`;
}

export function verifyMetaState(state: string | null, nonce: string | undefined, now = Date.now()): MetaState | null {
  if (!state || !nonce || !stateKey()) return null;
  const [version, payload, signature, extra] = state.split(".");
  if (version !== "meta-v1" || !payload || !signature || extra) return null;
  const body = `${version}.${payload}`;
  const expected = Buffer.from(sign(body));
  const provided = Buffer.from(signature);
  if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Partial<MetaState>;
    if (typeof parsed.companyId !== "string" || typeof parsed.userId !== "string" || parsed.nonce !== nonce || typeof parsed.exp !== "number" || parsed.exp * 1000 < now) return null;
    return parsed as MetaState;
  } catch { return null; }
}

export async function metaGraph(path: string, params: Record<string, string>, token?: string, timeoutMs = 12_000) {
  const config = metaConfig();
  if (!config) throw new Error("Meta publishing is not configured");
  const url = new URL(`https://graph.facebook.com/${config.version}/${path.replace(/^\//, "")}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  if (token) {
    url.searchParams.set("access_token", token);
    url.searchParams.set("appsecret_proof", createHmac("sha256", config.appSecret).update(token).digest("hex"));
  }
  const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs), redirect: "error", cache: "no-store" });
  const data = await response.json().catch(() => null) as Record<string, unknown> | null;
  if (!response.ok || !data || data.error) {
    const status = response.status;
    throw new MetaGraphError(status, isMetaErrorRetrySafe(status));
  }
  return data;
}

export async function metaGraphPost(path: string, values: Record<string, string>, token: string, timeoutMs = 15_000) {
  const config = metaConfig();
  if (!config) throw new Error("Meta publishing is not configured");
  const url = new URL(`https://graph.facebook.com/${config.version}/${path.replace(/^\//, "")}`);
  const body = new URLSearchParams({ ...values, access_token: token, appsecret_proof: createHmac("sha256", config.appSecret).update(token).digest("hex") });
  const response = await fetch(url, { method: "POST", body, headers: { "content-type": "application/x-www-form-urlencoded" }, signal: AbortSignal.timeout(timeoutMs), redirect: "error", cache: "no-store" });
  const data = await response.json().catch(() => null) as Record<string, unknown> | null;
  if (!response.ok || !data || data.error) throw new MetaGraphError(response.status, !isMetaErrorRetrySafe(response.status) || response.status === 200);
  return data;
}

export class MetaGraphError extends Error {
  constructor(public status: number, public uncertain: boolean) { super(`Meta Graph API error (${status})`); }
}
export function isMetaErrorRetrySafe(status: number) { return status > 0 && status < 500 && status !== 408 && status !== 429; }
