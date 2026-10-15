/**
 * "View as": an admin sees the platform exactly as one client company sees
 * it, without a second login. Modelled on agency-ops/src/lib/view-as.ts.
 *
 * A signed, short-lived, httpOnly cookie names the company. The real session
 * must be an admin; the cookie alone grants nothing. While viewing, every
 * page reads the effective profile (role client, that company) through
 * getUserProfile, so the menu, the home page and the fences are the client's.
 * API routes and RLS still see the real admin, so an action taken while
 * viewing is recorded as the admin, and the banner says so.
 *
 * Signed with HMAC-SHA256 over Web Crypto so the same code runs in the
 * middleware and in route handlers. Pure: no I/O, so it is tested directly.
 *
 * Wire format: base64url(companyId).expiry.base64url(signature)
 */

export const VIEW_AS_COOKIE = "portal_view_as";
export const VIEW_AS_TTL_SECONDS = 60 * 60;

const enc = new TextEncoder();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

/**
 * The cookie's own signing secret (VIEW_AS_SECRET), never the service-role
 * key. Empty when unset, which disables view-as.
 */
export function viewAsSecret(env: Record<string, string | undefined> = process.env): string {
  return (env.VIEW_AS_SECRET || "").trim();
}

export async function signViewAs(companyId: string, secret: string, now = Date.now()): Promise<string> {
  if (!UUID.test(companyId)) throw new Error("companyId must be a uuid");
  const exp = Math.floor(now / 1000) + VIEW_AS_TTL_SECONDS;
  const body = `${b64url(enc.encode(companyId.toLowerCase()))}.${exp}`;
  return `${body}.${b64url(await hmac(secret, body))}`;
}

/** The company id a cookie names, or null when it is missing, malformed, tampered with or expired. */
export async function verifyViewAs(cookie: string | null | undefined, secret: string, now = Date.now()): Promise<string | null> {
  if (!cookie || !secret) return null;
  const parts = cookie.split(".");
  if (parts.length !== 3) return null;
  const [idPart, expPart, sigPart] = parts;
  const exp = Number(expPart);
  if (!Number.isInteger(exp) || exp * 1000 < now) return null;
  const sig = fromB64url(sigPart);
  const idBytes = fromB64url(idPart);
  if (!sig || !idBytes) return null;
  const expected = await hmac(secret, `${idPart}.${expPart}`);
  if (!equal(sig, expected)) return null;
  const id = new TextDecoder().decode(idBytes);
  return UUID.test(id) ? id : null;
}

export const VIEW_AS_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true,
  sameSite: "lax" as const,
  path: "/",
  maxAge: VIEW_AS_TTL_SECONDS,
};
