import type {
  DirectSocialAdapter,
  DirectSocialMedia,
  DirectSocialPublishInput,
} from "@/lib/publishing/direct-social";
import { MAX_VIDEO_BYTES, VIDEO_MIME_TYPES } from "@/lib/upload/media-constants";
import { exactYouTubeChannel, isPortalVideoUrl, listMyYouTubeChannels, refreshYouTubeToken } from "@/lib/youtube/client";

const UPLOAD_INIT_URL = "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status";
const MAX_TITLE_LENGTH = 100;
const MAX_DESCRIPTION_LENGTH = 5000;
const UPLOAD_TIMEOUT_MS = 300_000;

type Outcome =
  | { kind: "published"; externalId: string; externalUrl?: string }
  | { kind: "not-published"; message: string }
  | { kind: "uncertain"; message: string };

function isPrivacy(value: unknown): value is "public" | "unlisted" | "private" {
  return value === "public" || value === "unlisted" || value === "private";
}

function safeVideoType(media: DirectSocialMedia, response: Response): string | null {
  const supplied = media.mimeType.toLowerCase().split(";")[0].trim();
  const actual = (response.headers.get("content-type") || "").toLowerCase().split(";")[0].trim();
  const mime = supplied || actual;
  if (!VIDEO_MIME_TYPES.includes(mime) || (actual && actual !== mime)) return null;
  return mime;
}

function combinedSignal(signal: AbortSignal, timeoutMs: number): AbortSignal {
  return AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]);
}

function isGoogleUploadUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "www.googleapis.com" &&
      url.port === "" && url.username === "" && url.password === "" &&
      url.pathname === "/upload/youtube/v3/videos" && !!url.searchParams.get("upload_id");
  } catch {
    return false;
  }
}

function validateInput(input: DirectSocialPublishInput): { media: DirectSocialMedia; title: string; privacyStatus: string; madeForKids: boolean } | string {
  if (input.account.platform !== "youtube" || !input.account.isActive) return "The selected YouTube channel is no longer connected.";
  if (!input.account.accountId) return "The selected YouTube channel could not be verified.";
  if (typeof input.title !== "string" || !input.title.trim() || input.title.length > MAX_TITLE_LENGTH) return "The video title must be between 1 and 100 characters.";
  if (typeof input.text !== "string" || input.text.length > MAX_DESCRIPTION_LENGTH) return "The video description exceeds YouTube's 5,000 character limit.";
  if (!isPrivacy(input.options.privacy)) return "Choose a valid YouTube privacy setting.";
  if (typeof input.options.madeForKids !== "boolean") return "Confirm whether this video is made for children.";
  if (!input.media || input.media.kind !== "video") return "YouTube requires one rendered video.";
  if (!isPortalVideoUrl(input.media.url)) return "The video must be hosted in the platform's content library.";
  return { media: input.media, title: input.title.trim(), privacyStatus: input.options.privacy, madeForKids: input.options.madeForKids };
}

/** Shared-queue adapter: it runs only when the approved job becomes due. */
export const youtubeAdapter: DirectSocialAdapter = {
  async refreshIfNeeded(input: DirectSocialPublishInput) {
    const expiresAt = input.credentials.expiresAt ? Date.parse(input.credentials.expiresAt) : Number.NaN;
    if (Number.isFinite(expiresAt) && expiresAt > Date.now() + 5 * 60_000) return { kind: "unchanged" as const };
    if (!input.credentials.refreshToken) return { kind: "unchanged" as const };
    const clientId = process.env.YOUTUBE_CLIENT_ID;
    const clientSecret = process.env.YOUTUBE_CLIENT_SECRET;
    if (!clientId || !clientSecret) return { kind: "unchanged" as const };
    try {
      const fresh = await refreshYouTubeToken(input.credentials.refreshToken, clientId, clientSecret);
      return {
        kind: "refreshed" as const,
        credentials: {
          accessToken: fresh.accessToken,
          refreshToken: fresh.refreshToken || input.credentials.refreshToken,
          expiresAt: fresh.expiresAt,
          providerMetadata: input.credentials.providerMetadata,
        },
      };
    } catch {
      // A subsequent upload-init 401 is a definite rejection, with no video written.
      return { kind: "unchanged" as const };
    }
  },

  async publish(input: DirectSocialPublishInput): Promise<Outcome> {
    const checked = validateInput(input);
    if (typeof checked === "string") return { kind: "not-published", message: checked };
    if (!input.credentials.accessToken) return { kind: "not-published", message: "The YouTube connection needs reconnecting." };

    try {
      const channels = await listMyYouTubeChannels(input.credentials.accessToken, input.signal);
      if (!exactYouTubeChannel(channels, input.account.accountId)) {
        return { kind: "not-published", message: "The selected YouTube channel could not be confirmed. Set the intended channel as the Google account's default, then reconnect." };
      }
    } catch {
      return { kind: "not-published", message: "The selected YouTube channel could not be verified. Reconnect before publishing." };
    }

    let mediaResponse: Response;
    try {
      mediaResponse = await fetch(checked.media.url, {
        method: "GET",
        redirect: "error",
        cache: "no-store",
        signal: combinedSignal(input.signal, UPLOAD_TIMEOUT_MS),
      });
    } catch {
      return { kind: "not-published", message: "The approved video could not be read from the content library." };
    }
    if (!mediaResponse.ok || !mediaResponse.body) {
      await mediaResponse.body?.cancel().catch(() => undefined);
      return { kind: "not-published", message: "The approved video could not be read from the content library." };
    }
    const mimeType = safeVideoType(checked.media, mediaResponse);
    const size = Number(mediaResponse.headers.get("content-length"));
    if (!mimeType || !Number.isSafeInteger(size) || size <= 0 || size > MAX_VIDEO_BYTES) {
      await mediaResponse.body.cancel().catch(() => undefined);
      return { kind: "not-published", message: "The rendered video type or size is unsupported." };
    }

    let initResponse: Response;
    try {
      initResponse = await fetch(UPLOAD_INIT_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${input.credentials.accessToken}`,
          "Content-Type": "application/json; charset=UTF-8",
          "X-Upload-Content-Length": String(size),
          "X-Upload-Content-Type": mimeType,
        },
        body: JSON.stringify({
          snippet: { title: checked.title, description: input.text },
          status: { privacyStatus: checked.privacyStatus, selfDeclaredMadeForKids: checked.madeForKids },
        }),
        signal: combinedSignal(input.signal, 30_000),
        cache: "no-store",
        redirect: "error",
      });
    } catch {
      await mediaResponse.body.cancel().catch(() => undefined);
      return { kind: "not-published", message: "YouTube could not start the upload. The video was not published." };
    }
    if (initResponse.status !== 200 && initResponse.status !== 201) {
      await mediaResponse.body.cancel().catch(() => undefined);
      return { kind: "not-published", message: `YouTube rejected the upload request (HTTP ${initResponse.status}).` };
    }

    const sessionUrl = initResponse.headers.get("location");
    if (!sessionUrl || !isGoogleUploadUrl(sessionUrl)) {
      await mediaResponse.body.cancel().catch(() => undefined);
      return { kind: "not-published", message: "YouTube returned an invalid upload session." };
    }

    try {
      const uploadResponse = await fetch(sessionUrl, {
        method: "PUT",
        headers: { Authorization: `Bearer ${input.credentials.accessToken}`, "Content-Type": mimeType, "Content-Length": String(size) },
        body: mediaResponse.body,
        signal: combinedSignal(input.signal, UPLOAD_TIMEOUT_MS),
        cache: "no-store",
        redirect: "error",
        duplex: "half",
      } as RequestInit & { duplex: "half" });

      if (uploadResponse.status < 200 || uploadResponse.status >= 300) {
        if (uploadResponse.status >= 400 && uploadResponse.status < 500) {
          return { kind: "not-published", message: `YouTube rejected the video (HTTP ${uploadResponse.status}).` };
        }
        return { kind: "uncertain", message: "YouTube's upload response was inconclusive. Check the selected channel before taking further action." };
      }
      const data = await uploadResponse.json().catch(() => null) as { id?: unknown } | null;
      if (typeof data?.id !== "string" || !/^[A-Za-z0-9_-]{6,}$/.test(data.id)) {
        return { kind: "uncertain", message: "YouTube may have accepted the video. Check the selected channel before taking further action." };
      }
      return { kind: "published", externalId: data.id, externalUrl: `https://www.youtube.com/watch?v=${data.id}` };
    } catch {
      return { kind: "uncertain", message: "YouTube may have accepted the video. Check the selected channel before taking further action." };
    }
  },
};

export function youtubeConfigured(env: Record<string, string | undefined> = process.env): boolean {
  return !!(env.YOUTUBE_CLIENT_ID && env.YOUTUBE_CLIENT_SECRET && env.YOUTUBE_REDIRECT_URI && env.ENCRYPTION_KEY);
}
