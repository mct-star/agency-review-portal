import type { PublishingProvider, PublishInput, PublishOutput } from "./types";

/**
 * YouTube publishing provider.
 * Uses YouTube Data API v3 for video uploads and metadata.
 * Requires OAuth2 access token (not just API key — uploads need auth).
 */
export function createYouTubePublishingProvider(
  credentials: Record<string, unknown>,
  settings: Record<string, unknown>
): PublishingProvider {
  const accessToken = credentials.access_token as string;
  if (!accessToken) {
    throw new Error(
      "YouTube publishing requires an access_token in provider config (OAuth2)"
    );
  }

  const defaultPrivacy = (settings.default_privacy as string) || "private";

  return {
    async publish(input: PublishInput): Promise<PublishOutput> {
      if (!input.mediaUrls || input.mediaUrls.length === 0) {
        throw new Error("YouTube publishing requires at least one video URL in mediaUrls");
      }

      const videoUrl = input.mediaUrls[0];

      // Step 1: Download the video file
      const videoRes = await fetch(videoUrl);
      if (!videoRes.ok) {
        throw new Error(`Failed to download video from ${videoUrl}: ${videoRes.status}`);
      }
      const videoBlob = await videoRes.blob();

      // Step 2: Create the upload via resumable upload protocol
      const metadata = {
        snippet: {
          title: input.title,
          description: input.content,
          tags: input.tags || [],
          categoryId: (settings.category_id as string) || "22", // "People & Blogs"
        },
        status: {
          privacyStatus: input.scheduledFor ? "private" : defaultPrivacy,
          publishAt: input.scheduledFor || undefined,
          selfDeclaredMadeForKids: false,
        },
      };

      // Initiate resumable upload
      const initRes = await fetch(
        "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json; charset=UTF-8",
            "X-Upload-Content-Length": String(videoBlob.size),
            "X-Upload-Content-Type": videoBlob.type || "video/mp4",
          },
          body: JSON.stringify(metadata),
        }
      );

      if (!initRes.ok) {
        const errText = await initRes.text();
        throw new Error(`YouTube upload init error (${initRes.status}): ${errText}`);
      }

      const uploadUrl = initRes.headers.get("Location");
      if (!uploadUrl) {
        throw new Error("YouTube did not return a resumable upload URL");
      }

      // Upload the video bytes
      const uploadRes = await fetch(uploadUrl, {
        method: "PUT",
        headers: {
          "Content-Type": videoBlob.type || "video/mp4",
          "Content-Length": String(videoBlob.size),
        },
        body: videoBlob,
      });

      if (!uploadRes.ok) {
        const errText = await uploadRes.text();
        throw new Error(`YouTube upload error (${uploadRes.status}): ${errText}`);
      }

      const videoData = await uploadRes.json();
      const videoId = videoData.id;

      return {
        externalId: videoId,
        externalUrl: `https://www.youtube.com/watch?v=${videoId}`,
        status: input.scheduledFor ? "scheduled" : "published",
      };
    },
  };
}
