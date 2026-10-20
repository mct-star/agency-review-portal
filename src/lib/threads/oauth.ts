import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const THREADS_NONCE_COOKIE = "threads_oauth_nonce";
export const THREADS_SCOPES = ["threads_basic", "threads_content_publish"] as const;
const TTL_SECONDS = 600;

export function threadsConfig(env: Record<string, string | undefined> = process.env) {
  const appId = env.THREADS_APP_ID?.trim();
  const appSecret = env.THREADS_APP_SECRET?.trim();
  const redirectUri = env.THREADS_REDIRECT_URI?.trim();
  return appId && appSecret && redirectUri ? { appId, appSecret, redirectUri } : null;
}

export function newThreadsNonce() { return randomBytes(24).toString("base64url"); }

type ThreadsState = { companyId: string; userId: string; nonce: string; exp: number; returnTo?: "setup" | "publish" };

function sign(value: string, secret: string) {
  return createHmac("sha256", secret).update(value).digest("base64url");
}

export function createThreadsState(value: Omit<ThreadsState, "exp">, secret: string, now = Date.now()) {
  const payload = Buffer.from(JSON.stringify({ ...value, exp: Math.floor(now / 1000) + TTL_SECONDS })).toString("base64url");
  const body = `threads-v1.${payload}`;
  return `${body}.${sign(body, secret)}`;
}

export function verifyThreadsState(state: string | null, nonce: string | undefined, secret: string, now = Date.now()): ThreadsState | null {
  if (!state || !nonce || !secret) return null;
  const [version, payload, signature, extra] = state.split(".");
  if (version !== "threads-v1" || !payload || !signature || extra) return null;
  const body = `${version}.${payload}`;
  const expected = Buffer.from(sign(body, secret));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Partial<ThreadsState>;
    if (typeof parsed.companyId !== "string" || typeof parsed.userId !== "string" || parsed.nonce !== nonce || typeof parsed.exp !== "number" || parsed.exp * 1000 < now) return null;
    if (parsed.returnTo !== undefined && parsed.returnTo !== "setup" && parsed.returnTo !== "publish") return null;
    return parsed as ThreadsState;
  } catch {
    return null;
  }
}

export type ThreadsToken = { access_token: string; expires_in?: number; user_id?: string };

export class ThreadsApiError extends Error {
  constructor(public status: number) { super(`Threads API request failed (${status})`); }
}

export async function threadsRequest(path: string, token: string, values: Record<string, string> = {}, method: "GET" | "POST" = "GET", timeoutMs = 12_000) {
  const url = new URL(`https://graph.threads.net/v1.0/${path.replace(/^\//, "")}`);
  if (method === "GET") for (const [key, value] of Object.entries(values)) url.searchParams.set(key, value);
  const response = await fetch(url, {
    method,
    headers: { authorization: `Bearer ${token}`, ...(method === "POST" ? { "content-type": "application/x-www-form-urlencoded" } : {}) },
    body: method === "POST" ? new URLSearchParams(values) : undefined,
    redirect: "error",
    cache: "no-store",
    signal: AbortSignal.timeout(timeoutMs),
  });
  const body = await response.json().catch(() => null) as Record<string, unknown> | null;
  if (!response.ok || !body || body.error) throw new ThreadsApiError(response.status);
  return body;
}
