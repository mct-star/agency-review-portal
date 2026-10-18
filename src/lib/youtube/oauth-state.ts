/** Signed, short-lived OAuth state tied to the browser that began the flow. */

export const YOUTUBE_STATE_TTL_SECONDS = 10 * 60;

export interface YouTubeOAuthState {
  companyId: string;
  userId: string;
  returnTo: "setup" | "publish";
  nonce: string;
}

const enc = new TextEncoder();

function encode(bytes: Uint8Array): string {
  let raw = "";
  for (const byte of bytes) raw += String.fromCharCode(byte);
  return btoa(raw).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function decode(value: string): Uint8Array | null {
  try {
    const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - value.length % 4) % 4);
    return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

async function sign(secret: string, message: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(message)));
}

function equal(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export function youtubeStateSecret(env: Record<string, string | undefined> = process.env): string {
  return (env.YOUTUBE_STATE_SECRET || env.YOUTUBE_CLIENT_SECRET || "").trim();
}

export async function signYouTubeOAuthState(
  payload: YouTubeOAuthState,
  secret: string,
  now = Date.now(),
): Promise<string> {
  const expiry = Math.floor(now / 1000) + YOUTUBE_STATE_TTL_SECONDS;
  const body = `${encode(enc.encode(JSON.stringify(payload)))}.${expiry}`;
  return `${body}.${encode(await sign(secret, body))}`;
}

export async function verifyYouTubeOAuthState(
  state: string | null | undefined,
  secret: string,
  now = Date.now(),
): Promise<YouTubeOAuthState | null> {
  if (!state || !secret) return null;
  const parts = state.split(".");
  if (parts.length !== 3) return null;
  const [payload, expiryText, signature] = parts;
  const expiry = Number(expiryText);
  if (!Number.isSafeInteger(expiry) || expiry * 1000 < now) return null;
  const supplied = decode(signature);
  if (!supplied || !equal(await sign(secret, `${payload}.${expiryText}`), supplied)) return null;
  const bytes = decode(payload);
  if (!bytes) return null;
  try {
    const value = JSON.parse(new TextDecoder().decode(bytes)) as Partial<YouTubeOAuthState>;
    if (
      typeof value.companyId !== "string" ||
      typeof value.userId !== "string" ||
      typeof value.nonce !== "string" ||
      !/^[A-Za-z0-9_-]{32,}$/.test(value.nonce) ||
      (value.returnTo !== "setup" && value.returnTo !== "publish")
    ) return null;
    return { companyId: value.companyId, userId: value.userId, returnTo: value.returnTo, nonce: value.nonce };
  } catch {
    return null;
  }
}
