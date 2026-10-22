import type { DirectSocialAdapter, DirectSocialPublishInput, DirectSocialPublishResult } from "@/lib/publishing/direct-social";
import { getPinterestIdentity, listPinterestBoards, pinterestClientId, pinterestClientSecret, refreshPinterestGrant } from "@/lib/pinterest/oauth";
import { isOurStorageUrl } from "@/lib/media/our-storage-url";

const PINTEREST_API = "https://api.pinterest.com/v5";
const IMAGE_MAX_BYTES = 20 * 1024 * 1024;

export function isPinterestConfigured(env: Record<string, string | undefined> = process.env) {
  return !!env.PINTEREST_CLIENT_ID?.trim() && !!env.PINTEREST_CLIENT_SECRET?.trim();
}

function isPublicSupabaseImage(value: string) {
  try {
    const url = new URL(value);
    return isOurStorageUrl(value) && url.pathname.startsWith("/storage/v1/object/public/") && !url.search;
  } catch {
    return false;
  }
}

function safeLink(value: unknown): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string" || value.length > 2048) throw new Error("The Pinterest link is invalid");
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || !url.hostname || url.username || url.password) throw new Error();
    return url.toString();
  } catch {
    throw new Error("The Pinterest link must be a valid HTTPS address");
  }
}

async function pinterestRequest<T>(path: string, accessToken: string, init: RequestInit): Promise<{ status: number; ok: boolean; data: T }> {
  const response = await fetch(`${PINTEREST_API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${accessToken}`, ...(init.headers || {}) },
    signal: init.signal || AbortSignal.timeout(20_000),
  });
  const data = await response.json().catch(() => ({})) as T;
  return { status: response.status, ok: response.ok, data };
}

async function validateImage(input: DirectSocialPublishInput) {
  if (!input.media || input.media.kind !== "image") throw new Error("Pinterest publishing requires one image");
  if (!isPublicSupabaseImage(input.media.url)) throw new Error("The Pinterest image must be in this portal's public storage");
  const mime = input.media.mimeType.toLowerCase();
  if (!new Set(["image/jpeg", "image/png"]).has(mime)) throw new Error("Pinterest direct publishing supports JPEG or PNG images");
  const response = await fetch(input.media.url, { method: "GET", redirect: "error", cache: "no-store", signal: input.signal });
  if (!response.ok || !response.body) throw new Error("The approved Pinterest image could not be checked");
  const responseMime = (response.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  if (responseMime !== mime) throw new Error("The approved Pinterest image type changed after it was queued");
  const size = Number(response.headers.get("content-length") || 0);
  if (size > IMAGE_MAX_BYTES) throw new Error("The Pinterest image exceeds this portal's 20 MB upload limit");
  const reader = response.body.getReader();
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > IMAGE_MAX_BYTES) {
        await reader.cancel();
        throw new Error("The Pinterest image exceeds this portal's 20 MB upload limit");
      }
    }
  } finally {
    reader.releaseLock();
  }
  if (!total) throw new Error("The approved Pinterest image is empty");
}

function publishingFailure(status: number): DirectSocialPublishResult {
  if (status === 408 || status === 429 || status >= 500) return { kind: "uncertain", message: "Pinterest did not confirm whether it created the Pin. Check the selected board before retrying." };
  return { kind: "not-published", message: `Pinterest rejected the Pin (HTTP ${status}). Correct the post or connection before trying again.` };
}

export const pinterestAdapter: DirectSocialAdapter = {
  async refreshIfNeeded(input) {
    const expiry = input.credentials.expiresAt ? Date.parse(input.credentials.expiresAt) : Number.NaN;
    if (Number.isFinite(expiry) && expiry > Date.now() + 120_000) return { kind: "unchanged" };
    if (!input.credentials.refreshToken || !pinterestClientId() || !pinterestClientSecret()) throw new Error("The Pinterest connection needs reconnecting");
    const refreshExpiry = input.credentials.providerMetadata?.refreshTokenExpiresAt;
    if (typeof refreshExpiry === "string" && (!Number.isFinite(Date.parse(refreshExpiry)) || Date.parse(refreshExpiry) <= Date.now())) {
      throw new Error("The Pinterest refresh grant has expired. Reconnect the account.");
    }
    const grant = await refreshPinterestGrant(input.credentials.refreshToken, pinterestClientId(), pinterestClientSecret());
    return {
      kind: "refreshed",
      credentials: {
        accessToken: grant.accessToken,
        refreshToken: grant.refreshToken,
        expiresAt: grant.expiresAt,
        providerMetadata: { scope: grant.scope, refreshTokenExpiresAt: grant.refreshTokenExpiresAt },
      },
    };
  },

  async publish(input) {
    if (input.account.platform !== "pinterest") return { kind: "not-published", message: "This connection is not a Pinterest account." };
    const boardId = input.options.boardId;
    if (typeof boardId !== "string" || !boardId) return { kind: "not-published", message: "Select a Pinterest board before publishing." };
    if (!input.text.trim() && !input.title?.trim()) return { kind: "not-published", message: "The Pinterest Pin needs a title or description." };

    let imageUrl: string;
    let link: string | undefined;
    try {
      if (!input.media) throw new Error("Pinterest publishing requires one image");
      imageUrl = input.media.url;
      await validateImage(input);
      link = safeLink(input.options.link);
    } catch (error) {
      return { kind: "not-published", message: error instanceof Error ? error.message : "The Pinterest Pin could not be prepared." };
    }

    try {
      const identity = await getPinterestIdentity(input.credentials.accessToken);
      if (identity.username.toLowerCase() !== input.account.accountId.toLowerCase()) {
        return { kind: "not-published", message: "The saved Pinterest token no longer matches the selected account." };
      }
      const boards = await listPinterestBoards(input.credentials.accessToken);
      if (!boards.some((board) => board.id === boardId)) return { kind: "not-published", message: "The selected Pinterest board is no longer available to this account." };
    } catch {
      return { kind: "not-published", message: "The Pinterest account or selected board could not be verified. Reconnect the account if its access has expired." };
    }

    let response: { status: number; ok: boolean; data: { id?: unknown } };
    try {
      response = await pinterestRequest("/pins", input.credentials.accessToken, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          board_id: boardId,
          title: input.title?.trim() || undefined,
          description: input.text,
          ...(link ? { link } : {}),
          media_source: { source_type: "image_url", url: imageUrl, is_standard: true },
        }),
        signal: input.signal,
      });
    } catch {
      return { kind: "uncertain", message: "Pinterest may have created the Pin, but its response was not received. Check the selected board before retrying." };
    }
    if (!response.ok) return publishingFailure(response.status);
    if (typeof response.data.id !== "string" || !response.data.id) return { kind: "uncertain", message: "Pinterest accepted a create request without returning its Pin ID. Check the selected board before retrying." };
    return { kind: "published", externalId: response.data.id };
  },
};
