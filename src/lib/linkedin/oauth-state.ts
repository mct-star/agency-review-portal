/**
 * Signed state for the LinkedIn OAuth flow.
 *
 * Before 14 Oct 2026 the state was the bare company id and the callback
 * required no sign-in, so anyone could bind their own LinkedIn account to
 * any company. The state is now base64url(JSON) . expiry . HMAC-SHA256, and
 * the callback checks that the signed-in admin is the one who started it.
 * Web Crypto only, so the same code runs in a route handler and in tests.
 */

export const OAUTH_STATE_TTL_SECONDS = 10 * 60;

export interface OAuthStatePayload {
  companyId: string;
  userId: string;
  returnTo: "setup" | "publish";
}

const enc = new TextEncoder();

function b64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64url(s: string): Uint8Array | null {
  try {
    const padded = s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4);
    return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

async function hmac(secret: string, message: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(message)));
}

function equal(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

/** The signing secret: the LinkedIn client secret, which only the server holds. Empty disables the flow. */
export function oauthStateSecret(env: Record<string, string | undefined> = process.env): string {
  return (env.LINKEDIN_STATE_SECRET || env.LINKEDIN_CLIENT_SECRET || "").trim();
}

export async function signOAuthState(payload: OAuthStatePayload, secret: string, now = Date.now()): Promise<string> {
  const exp = Math.floor(now / 1000) + OAUTH_STATE_TTL_SECONDS;
  const body = `${b64url(enc.encode(JSON.stringify(payload)))}.${exp}`;
  return `${body}.${b64url(await hmac(secret, body))}`;
}

/** The payload a state names, or null when it is missing, malformed, tampered with or expired. */
export async function verifyOAuthState(state: string | null | undefined, secret: string, now = Date.now()): Promise<OAuthStatePayload | null> {
  if (!state || !secret) return null;
  const parts = state.split(".");
  if (parts.length !== 3) return null;
  const [payloadPart, expPart, sigPart] = parts;
  const exp = Number(expPart);
  if (!Number.isFinite(exp) || exp * 1000 < now) return null;
  const expected = await hmac(secret, `${payloadPart}.${expPart}`);
  const given = fromB64url(sigPart);
  if (!given || !equal(expected, given)) return null;
  const raw = fromB64url(payloadPart);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(new TextDecoder().decode(raw)) as Partial<OAuthStatePayload>;
    if (typeof parsed.companyId !== "string" || typeof parsed.userId !== "string") return null;
    const returnTo = parsed.returnTo === "publish" ? "publish" : "setup";
    return { companyId: parsed.companyId, userId: parsed.userId, returnTo };
  } catch {
    return null;
  }
}
