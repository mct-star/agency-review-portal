import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const PINTEREST_AUTHORIZE_URL = "https://www.pinterest.com/oauth/";
const PINTEREST_TOKEN_URL = "https://api.pinterest.com/v5/oauth/token";
const PINTEREST_API = "https://api.pinterest.com/v5";

export const PINTEREST_SCOPES = ["user_accounts:read", "boards:read", "boards:write", "pins:read", "pins:write"] as const;
export const PINTEREST_STATE_COOKIE = "pinterest_oauth_pending";
export const PINTEREST_STATE_TTL_SECONDS = 600;

export interface PinterestOAuthState {
  companyId: string;
  userId: string;
  returnTo: "setup" | "publish";
  nonce: string;
}

export interface PinterestOAuthGrant {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  refreshTokenExpiresAt: string | null;
  scope: string[];
}

function sign(secret: string, value: string) {
  return Buffer.from(createHmac("sha256", secret).update(value).digest()).toString("base64url");
}

function safeEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function pinterestClientId(env: Record<string, string | undefined> = process.env) {
  return env.PINTEREST_CLIENT_ID?.trim() || "";
}

export function pinterestClientSecret(env: Record<string, string | undefined> = process.env) {
  return env.PINTEREST_CLIENT_SECRET?.trim() || "";
}

export function pinterestRedirectUri(origin: string, env: Record<string, string | undefined> = process.env) {
  return env.PINTEREST_REDIRECT_URI?.trim() || `${origin}/api/auth/pinterest/callback`;
}

export function makePinterestNonce() {
  return randomBytes(32).toString("base64url");
}

export function signPinterestState(payload: PinterestOAuthState, secret: string, now = Date.now()) {
  const body = `${Buffer.from(JSON.stringify(payload)).toString("base64url")}.${Math.floor(now / 1000) + PINTEREST_STATE_TTL_SECONDS}`;
  return `${body}.${sign(secret, body)}`;
}

export function verifyPinterestState(state: string | null, secret: string, now = Date.now()): PinterestOAuthState | null {
  if (!state || !secret) return null;
  const parts = state.split(".");
  if (parts.length !== 3 || !/^\d+$/.test(parts[1]) || Number(parts[1]) < Math.floor(now / 1000)) return null;
  const body = `${parts[0]}.${parts[1]}`;
  if (!safeEqual(parts[2], sign(secret, body))) return null;
  try {
    const parsed = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8")) as Partial<PinterestOAuthState>;
    if (typeof parsed.companyId !== "string" || typeof parsed.userId !== "string" || typeof parsed.nonce !== "string" || !parsed.nonce) return null;
    if (parsed.returnTo !== "setup" && parsed.returnTo !== "publish") return null;
    return { companyId: parsed.companyId, userId: parsed.userId, nonce: parsed.nonce, returnTo: parsed.returnTo };
  } catch {
    return null;
  }
}

export function getPinterestAuthorizationUrl(clientId: string, redirectUri: string, state: string) {
  const url = new URL(PINTEREST_AUTHORIZE_URL);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", PINTEREST_SCOPES.join(","));
  url.searchParams.set("state", state);
  return url;
}

type TokenResponse = {
  access_token?: unknown;
  refresh_token?: unknown;
  expires_in?: unknown;
  refresh_token_expires_in?: unknown;
  refresh_token_expires_at?: unknown;
  scope?: unknown;
};

async function requestPinterestToken(form: URLSearchParams, clientId: string, clientSecret: string): Promise<PinterestOAuthGrant> {
  const response = await fetch(PINTEREST_TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form,
    signal: AbortSignal.timeout(15_000),
  });
  const data = await response.json().catch(() => ({})) as TokenResponse;
  if (!response.ok || typeof data.access_token !== "string" || typeof data.refresh_token !== "string") throw new Error(`Pinterest token request failed (${response.status})`);
  if (typeof data.expires_in !== "number" || !Number.isFinite(data.expires_in) || data.expires_in <= 0) throw new Error("Pinterest returned an invalid access token expiry");
  const scopes = typeof data.scope === "string" ? data.scope.split(/[ ,]+/).filter(Boolean) : [];
  if (!PINTEREST_SCOPES.every((scope) => scopes.includes(scope))) throw new Error("Pinterest did not grant the required publishing permissions");
  const refreshTokenExpiresAt = typeof data.refresh_token_expires_at === "number" && Number.isFinite(data.refresh_token_expires_at)
    ? new Date(data.refresh_token_expires_at * 1000).toISOString()
    : typeof data.refresh_token_expires_in === "number" && Number.isFinite(data.refresh_token_expires_in)
      ? new Date(Date.now() + data.refresh_token_expires_in * 1000).toISOString()
      : null;
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: new Date(Date.now() + data.expires_in * 1000).toISOString(),
    refreshTokenExpiresAt,
    scope: scopes,
  };
}

export async function exchangePinterestCode(code: string, clientId: string, clientSecret: string, redirectUri: string) {
  return requestPinterestToken(new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: redirectUri }), clientId, clientSecret);
}

export async function refreshPinterestGrant(refreshToken: string, clientId: string, clientSecret: string) {
  return requestPinterestToken(new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken }), clientId, clientSecret);
}

async function pinterestApi<T>(path: string, accessToken: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${PINTEREST_API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${accessToken}`, ...(init.headers || {}) },
    signal: init.signal || AbortSignal.timeout(15_000),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Pinterest API request failed (${response.status})`);
  return data as T;
}

export async function getPinterestIdentity(accessToken: string) {
  const data = await pinterestApi<{ username?: unknown; account_type?: unknown; profile_image?: unknown }>("/user_account", accessToken);
  if (typeof data.username !== "string" || !data.username) throw new Error("Pinterest did not return an account identity");
  return { username: data.username, accountType: typeof data.account_type === "string" ? data.account_type : null, profileImage: typeof data.profile_image === "string" ? data.profile_image : null };
}

export interface PinterestBoard {
  id: string;
  name: string;
  privacy: string | null;
}

export async function listPinterestBoards(accessToken: string): Promise<PinterestBoard[]> {
  const boards: PinterestBoard[] = [];
  let bookmark: string | null = null;
  for (let page = 0; page < 8; page++) {
    const query = new URLSearchParams({ page_size: "100" });
    if (bookmark) query.set("bookmark", bookmark);
    const data = await pinterestApi<{ items?: Array<{ id?: unknown; name?: unknown; privacy?: unknown }>; bookmark?: unknown }>(`/boards?${query}`, accessToken);
    for (const row of data.items || []) {
      if (typeof row.id === "string" && typeof row.name === "string") boards.push({ id: row.id, name: row.name, privacy: typeof row.privacy === "string" ? row.privacy : null });
    }
    bookmark = typeof data.bookmark === "string" ? data.bookmark : null;
    if (!bookmark) break;
  }
  return boards;
}

export const PINTEREST_API_BASE = PINTEREST_API;
