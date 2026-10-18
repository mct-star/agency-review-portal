/** Small server-side client for the YouTube upload and channel identity endpoints. */

const API_BASE = "https://www.googleapis.com/youtube/v3";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
export const YOUTUBE_SCOPES = [
  "https://www.googleapis.com/auth/youtube.upload",
  "https://www.googleapis.com/auth/youtube.readonly",
] as const;

export interface YouTubeTokens {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: string;
  scope: string;
}

export interface YouTubeChannel {
  id: string;
  title: string;
  customUrl: string | null;
  thumbnail: string | null;
}

function requestSignal(signal?: AbortSignal): AbortSignal {
  const timeout = AbortSignal.timeout(20_000);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

export function getYouTubeAuthorizationUrl(clientId: string, redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: YOUTUBE_SCOPES.join(" "),
    state,
    access_type: "offline",
    include_granted_scopes: "true",
    prompt: "select_account consent",
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

async function tokenRequest(body: URLSearchParams): Promise<YouTubeTokens> {
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    signal: requestSignal(),
    cache: "no-store",
  });
  if (!response.ok) throw new Error("YouTube authorisation could not be completed.");
  const data = await response.json().catch(() => null) as Record<string, unknown> | null;
  if (!data || typeof data.access_token !== "string" || !data.access_token) {
    throw new Error("YouTube authorisation returned incomplete credentials.");
  }
  const expiresIn = typeof data.expires_in === "number" && Number.isFinite(data.expires_in) ? data.expires_in : 3600;
  const scopes = typeof data.scope === "string" ? data.scope : "";
  return {
    accessToken: data.access_token,
    refreshToken: typeof data.refresh_token === "string" && data.refresh_token ? data.refresh_token : null,
    expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
    scope: scopes,
  };
}

export async function exchangeYouTubeCode(
  code: string,
  clientId: string,
  clientSecret: string,
  redirectUri: string,
): Promise<YouTubeTokens> {
  return tokenRequest(new URLSearchParams({
    grant_type: "authorization_code", code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri,
  }));
}

export async function refreshYouTubeToken(
  refreshToken: string,
  clientId: string,
  clientSecret: string,
): Promise<YouTubeTokens> {
  const tokens = await tokenRequest(new URLSearchParams({
    grant_type: "refresh_token", refresh_token: refreshToken, client_id: clientId, client_secret: clientSecret,
  }));
  return { ...tokens, refreshToken: tokens.refreshToken || refreshToken };
}

export async function listMyYouTubeChannels(accessToken: string, signal?: AbortSignal): Promise<YouTubeChannel[]> {
  const channels: YouTubeChannel[] = [];
  let pageToken: string | undefined;
  for (let page = 0; page < 10; page++) {
    const params = new URLSearchParams({ part: "snippet", mine: "true", maxResults: "50" });
    if (pageToken) params.set("pageToken", pageToken);
    const response = await fetch(`${API_BASE}/channels?${params}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: requestSignal(signal),
      cache: "no-store",
      redirect: "error",
    });
    if (!response.ok) throw new Error("YouTube could not verify the authorised channel.");
    const data = await response.json().catch(() => null) as Record<string, unknown> | null;
    const items = data && Array.isArray(data.items) ? data.items : [];
    for (const item of items) {
      if (!item || typeof item !== "object") continue;
      const channel = item as { id?: unknown; snippet?: { title?: unknown; customUrl?: unknown; thumbnails?: { default?: { url?: unknown } } } };
      if (typeof channel.id !== "string" || typeof channel.snippet?.title !== "string") continue;
      channels.push({
        id: channel.id,
        title: channel.snippet.title,
        customUrl: typeof channel.snippet.customUrl === "string" ? channel.snippet.customUrl : null,
        thumbnail: typeof channel.snippet.thumbnails?.default?.url === "string" ? channel.snippet.thumbnails.default.url : null,
      });
    }
    pageToken = typeof data?.nextPageToken === "string" ? data.nextPageToken : undefined;
    if (!pageToken) return channels;
  }
  if (pageToken) throw new Error("YouTube returned too many channels to verify safely.");
  return channels;
}

/** The standard user upload API has no channelId argument, so only one verified effective channel is safe. */
export function exactYouTubeChannel(channels: YouTubeChannel[], expectedId?: string): YouTubeChannel | null {
  if (channels.length !== 1) return null;
  if (expectedId && channels[0].id !== expectedId) return null;
  return channels[0];
}

export function isPortalVideoUrl(value: unknown, supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL): value is string {
  if (typeof value !== "string" || !supabaseUrl) return false;
  try {
    const candidate = new URL(value);
    const storage = new URL(supabaseUrl);
    return candidate.protocol === "https:" && candidate.host === storage.host &&
      candidate.username === "" && candidate.password === "" &&
      candidate.pathname.startsWith("/storage/v1/object/public/content-assets/");
  } catch {
    return false;
  }
}
