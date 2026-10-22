import { JoseKey, Keyset, NodeOAuthClient } from "@atproto/oauth-client-node";
import type { NodeSavedSession, NodeSavedState, OAuthClientMetadataInput } from "@atproto/oauth-client-node";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { decrypt, encrypt } from "@/lib/crypto";

export const BLUESKY_NONCE_COOKIE = "bluesky_oauth_nonce";
export const BLUESKY_OAUTH_TTL_SECONDS = 10 * 60;
export const BLUESKY_OAUTH_SCOPE = "atproto repo:app.bsky.feed.post rpc:com.atproto.repo.uploadBlob";
export const BLUESKY_SESSION_MARKER = "bluesky-oauth-session-v1";

export function blueskyOAuthConfig(env: Record<string, string | undefined> = process.env) {
  const clientId = env.BLUESKY_OAUTH_CLIENT_ID?.trim();
  const redirectUri = env.BLUESKY_OAUTH_REDIRECT_URI?.trim();
  const privateJwk = env.BLUESKY_OAUTH_PRIVATE_JWK?.trim();
  if (!clientId || !redirectUri || !privateJwk) return null;
  try {
    const parsed = JSON.parse(privateJwk) as Record<string, unknown>;
    if (parsed.kty !== "EC" || parsed.crv !== "P-256" || typeof parsed.d !== "string") return null;
    return { clientId, redirectUri, privateJwk: parsed };
  } catch {
    return null;
  }
}

export function blueskyClientMetadata(env: Record<string, string | undefined> = process.env): OAuthClientMetadataInput | null {
  const config = blueskyOAuthConfig(env);
  if (!config) return null;
  const clientUri = new URL(config.clientId).origin;
  return {
    client_id: config.clientId,
    client_name: "AGENCY Content Platform",
    client_uri: clientUri,
    redirect_uris: [config.redirectUri],
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    scope: BLUESKY_OAUTH_SCOPE,
    token_endpoint_auth_method: "private_key_jwt",
    token_endpoint_auth_signing_alg: "ES256",
    jwks_uri: `${clientUri}/.well-known/jwks.json`,
    dpop_bound_access_tokens: true,
  };
}

type BlueskyOAuthState = { companyId: string; userId: string; nonce: string; exp: number; returnTo?: "setup" | "publish" };

function stateSigningSecret() { return process.env.BLUESKY_OAUTH_PRIVATE_JWK?.trim() || ""; }
function stateSign(body: string) { return createHmac("sha256", stateSigningSecret()).update(body).digest("base64url"); }

export function createBlueskyOAuthState(value: Omit<BlueskyOAuthState, "exp">, now = Date.now()) {
  const payload = Buffer.from(JSON.stringify({ ...value, exp: Math.floor(now / 1000) + BLUESKY_OAUTH_TTL_SECONDS })).toString("base64url");
  const body = `bluesky-v1.${payload}`;
  return `${body}.${stateSign(body)}`;
}

export function verifyBlueskyOAuthState(state: string | null, nonce: string | undefined, now = Date.now()): BlueskyOAuthState | null {
  if (!state || !nonce || !stateSigningSecret()) return null;
  const [version, payload, signature, extra] = state.split(".");
  if (version !== "bluesky-v1" || !payload || !signature || extra) return null;
  const body = `${version}.${payload}`;
  const expected = Buffer.from(stateSign(body));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Partial<BlueskyOAuthState>;
    if (typeof parsed.companyId !== "string" || typeof parsed.userId !== "string" || parsed.nonce !== nonce || typeof parsed.exp !== "number" || parsed.exp * 1000 < now) return null;
    if (parsed.returnTo !== undefined && parsed.returnTo !== "setup" && parsed.returnTo !== "publish") return null;
    return parsed as BlueskyOAuthState;
  } catch {
    return null;
  }
}

/** Verifies an SDK-indexed durable state row against its encrypted appState and browser session. */
export function verifyBlueskyPendingState(value: { companyId: string; userId: string; appState: unknown; expiresAt: string }, nonce: string | undefined, now = Date.now()) {
  const expiry = Date.parse(value.expiresAt);
  if (!Number.isFinite(expiry) || expiry <= now || typeof value.appState !== "string") return null;
  const state = verifyBlueskyOAuthState(value.appState, nonce, now);
  if (!state || state.companyId !== value.companyId || state.userId !== value.userId) return null;
  return state;
}

export type BlueskySavedSession = { marker: typeof BLUESKY_SESSION_MARKER; did: string; session: NodeSavedSession };

export function encodeBlueskySession(did: string, session: NodeSavedSession) {
  return JSON.stringify({ marker: BLUESKY_SESSION_MARKER, did, session } satisfies BlueskySavedSession);
}

export function decodeBlueskySession(value: string): BlueskySavedSession | null {
  try {
    const parsed = JSON.parse(value) as Partial<BlueskySavedSession>;
    return parsed.marker === BLUESKY_SESSION_MARKER && typeof parsed.did === "string" && parsed.session && typeof parsed.session === "object"
      ? parsed as BlueskySavedSession
      : null;
  } catch {
    return null;
  }
}

export function newBlueskyNonce() { return randomBytes(24).toString("base64url"); }

/** Creates the official atproto OAuth SDK with durable, expiring state and a request-local session cache. */
export async function createBlueskyOAuthClient(context?: { companyId: string; userId: string }, initialSession?: BlueskySavedSession) {
  const config = blueskyOAuthConfig();
  const metadata = blueskyClientMetadata();
  if (!config || !metadata) throw new Error("Bluesky OAuth is not configured.");
  const key = await JoseKey.fromJWK(config.privateJwk);
  const keyset = new Keyset([key]);
  const sessionCache = new Map<string, NodeSavedSession>();
  if (initialSession) sessionCache.set(initialSession.did, initialSession.session);
  const supabase = await createAdminSupabaseClient();

  const stateStore = {
    async get(key: string): Promise<NodeSavedState | undefined> {
      const { data } = await supabase.from("bluesky_oauth_states").select("encrypted_value,expires_at")
        .eq("state_key", key).maybeSingle();
      if (!data || !Number.isFinite(Date.parse(data.expires_at)) || Date.parse(data.expires_at) <= Date.now()) {
        if (data) await supabase.from("bluesky_oauth_states").delete().eq("state_key", key);
        return undefined;
      }
      try { return JSON.parse(decrypt(data.encrypted_value)) as NodeSavedState; }
      catch { return undefined; }
    },
    async set(key: string, value: NodeSavedState) {
      if (!context) throw new Error("Bluesky OAuth state has no initiating user context.");
      const { error } = await supabase.from("bluesky_oauth_states").upsert({
        state_key: key,
        company_id: context.companyId,
        user_id: context.userId,
        encrypted_value: encrypt(JSON.stringify(value)),
        expires_at: new Date(Date.now() + BLUESKY_OAUTH_TTL_SECONDS * 1000).toISOString(),
      }, { onConflict: "state_key" });
      if (error) throw new Error("Bluesky OAuth state could not be saved.");
    },
    async del(key: string) {
      await supabase.from("bluesky_oauth_states").delete().eq("state_key", key);
    },
  };

  const sessionStore = {
    async get(did: string): Promise<NodeSavedSession | undefined> { return sessionCache.get(did); },
    async set(did: string, value: NodeSavedSession) { sessionCache.set(did, value); },
    async del(did: string) { sessionCache.delete(did); },
  };

  const client = new NodeOAuthClient({ clientMetadata: metadata, keyset, stateStore, sessionStore });
  return { client, sessionCache };
}

/** Creates a request-local SDK session cache for an already stored account session. */
export async function createBlueskySessionClient(initialSession: BlueskySavedSession, onSessionUpdated?: (did: string, value: NodeSavedSession) => Promise<void>) {
  const config = blueskyOAuthConfig();
  const metadata = blueskyClientMetadata();
  if (!config || !metadata) throw new Error("Bluesky OAuth is not configured.");
  const key = await JoseKey.fromJWK(config.privateJwk);
  const sessionCache = new Map<string, NodeSavedSession>([[initialSession.did, initialSession.session]]);
  const client = new NodeOAuthClient({
    clientMetadata: metadata,
    keyset: new Keyset([key]),
    stateStore: { async get() { return undefined; }, async set() { throw new Error("No OAuth request is active."); }, async del() {} },
    sessionStore: {
      async get(did: string) { return sessionCache.get(did); },
      async set(did: string, value: NodeSavedSession) {
        sessionCache.set(did, value);
        await onSessionUpdated?.(did, value);
      },
      async del(did: string) { sessionCache.delete(did); },
    },
  });
  return { client, sessionCache };
}
