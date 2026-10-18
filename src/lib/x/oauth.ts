import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const X_AUTHORIZE_URL = "https://x.com/i/oauth2/authorize";
const X_TOKEN_URL = "https://api.x.com/2/oauth2/token";
const X_API = "https://api.x.com/2";
const enc = new TextEncoder();

export const X_SCOPES = ["tweet.read", "tweet.write", "users.read", "media.write", "offline.access"] as const;
export const X_STATE_COOKIE = "x_oauth_pending";
export const X_STATE_TTL_SECONDS = 600;

export interface XOAuthState {
  companyId: string;
  userId: string;
  returnTo: "setup" | "publish";
  nonce: string;
}

export interface XOAuthGrant {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  scope: string[];
}

function b64url(bytes: Uint8Array) {
  return Buffer.from(bytes).toString("base64url");
}

function sign(secret: string, value: string) {
  return b64url(new Uint8Array(createHmac("sha256", secret).update(value).digest()));
}

function safeEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function xClientId(env: Record<string, string | undefined> = process.env) {
  return env.X_CLIENT_ID?.trim() || "";
}

export function xClientSecret(env: Record<string, string | undefined> = process.env) {
  return env.X_CLIENT_SECRET?.trim() || "";
}

export function xRedirectUri(origin: string, env: Record<string, string | undefined> = process.env) {
  return env.X_REDIRECT_URI?.trim() || `${origin}/api/auth/x/callback`;
}

export function makeXVerifier() {
  return randomBytes(48).toString("base64url");
}

export function makeXChallenge(verifier: string) {
  return createHash("sha256").update(verifier).digest("base64url");
}

export function makeXNonce() {
  return randomBytes(32).toString("base64url");
}

export function signXState(payload: XOAuthState, secret: string, now = Date.now()) {
  const body = `${b64url(enc.encode(JSON.stringify(payload)))}.${Math.floor(now / 1000) + X_STATE_TTL_SECONDS}`;
  return `${body}.${sign(secret, body)}`;
}

export function verifyXState(state: string | null, secret: string, now = Date.now()): XOAuthState | null {
  if (!state || !secret) return null;
  const parts = state.split(".");
  if (parts.length !== 3 || !/^\d+$/.test(parts[1])) return null;
  const exp = Number(parts[1]);
  if (exp < Math.floor(now / 1000)) return null;
  const body = `${parts[0]}.${parts[1]}`;
  if (!safeEqual(parts[2], sign(secret, body))) return null;
  try {
    const parsed = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8")) as Partial<XOAuthState>;
    if (typeof parsed.companyId !== "string" || typeof parsed.userId !== "string" || typeof parsed.nonce !== "string" || !parsed.nonce) return null;
    if (parsed.returnTo !== "setup" && parsed.returnTo !== "publish") return null;
    return { companyId: parsed.companyId, userId: parsed.userId, nonce: parsed.nonce, returnTo: parsed.returnTo };
  } catch {
    return null;
  }
}

export function getXAuthorizationUrl(clientId: string, redirectUri: string, state: string, verifier: string) {
  const url = new URL(X_AUTHORIZE_URL);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("scope", X_SCOPES.join(" "));
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", makeXChallenge(verifier));
  url.searchParams.set("code_challenge_method", "S256");
  return url;
}

type TokenResponse = { access_token?: unknown; refresh_token?: unknown; expires_in?: unknown; scope?: unknown; error?: unknown };

async function requestXToken(form: URLSearchParams, clientId: string, clientSecret?: string): Promise<XOAuthGrant> {
  const headers = new Headers({ "Content-Type": "application/x-www-form-urlencoded" });
  if (clientSecret) headers.set("Authorization", `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`);
  else form.set("client_id", clientId);
  const response = await fetch(X_TOKEN_URL, { method: "POST", headers, body: form, signal: AbortSignal.timeout(15_000) });
  const data = await response.json().catch(() => ({})) as TokenResponse;
  if (!response.ok || typeof data.access_token !== "string") throw new Error(`X token request failed (${response.status})`);
  if (typeof data.expires_in !== "number" || !Number.isFinite(data.expires_in) || data.expires_in <= 0) throw new Error("X returned an invalid token expiry");
  const refreshToken = typeof data.refresh_token === "string" ? data.refresh_token : "";
  const scopes = typeof data.scope === "string" ? data.scope.split(/\s+/).filter(Boolean) : [];
  if (!refreshToken || !X_SCOPES.every((scope) => scopes.includes(scope))) throw new Error("X did not grant the required publishing permissions");
  return { accessToken: data.access_token, refreshToken, expiresAt: new Date(Date.now() + data.expires_in * 1000).toISOString(), scope: scopes };
}

export async function exchangeXCode(code: string, verifier: string, clientId: string, redirectUri: string, clientSecret?: string) {
  const form = new URLSearchParams({ code, grant_type: "authorization_code", redirect_uri: redirectUri, code_verifier: verifier });
  return requestXToken(form, clientId, clientSecret);
}

export async function refreshXGrant(refreshToken: string, clientId: string, clientSecret?: string) {
  const form = new URLSearchParams({ refresh_token: refreshToken, grant_type: "refresh_token" });
  return requestXToken(form, clientId, clientSecret);
}

async function xApi<T>(path: string, accessToken: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${X_API}${path}`, { ...init, headers: { Authorization: `Bearer ${accessToken}`, ...(init.headers || {}) }, signal: init.signal || AbortSignal.timeout(15_000) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`X API request failed (${response.status})`);
  return data as T;
}

export async function getXIdentity(accessToken: string) {
  const data = await xApi<{ data?: { id?: unknown; name?: unknown; username?: unknown } }>("/users/me?user.fields=id,name,username", accessToken);
  if (typeof data.data?.id !== "string" || typeof data.data.username !== "string") throw new Error("X did not return an account identity");
  return { id: data.data.id, username: data.data.username, name: typeof data.data.name === "string" ? data.data.name : data.data.username };
}

export async function revokeXToken(token: string, clientId: string, clientSecret?: string, tokenTypeHint: "access_token" | "refresh_token" = "refresh_token") {
  const headers = new Headers({ "Content-Type": "application/x-www-form-urlencoded" });
  if (clientSecret) headers.set("Authorization", `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`);
  const body = new URLSearchParams({ token, token_type_hint: tokenTypeHint });
  if (!clientSecret) body.set("client_id", clientId);
  const response = await fetch("https://api.x.com/2/oauth2/revoke", { method: "POST", headers, body, signal: AbortSignal.timeout(12_000) });
  if (!response.ok) throw new Error(`X token revocation failed (${response.status})`);
}

export const X_API_BASE = X_API;
