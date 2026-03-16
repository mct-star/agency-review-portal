import type { PublishingProvider, PublishInput, PublishOutput } from "./types";

/**
 * TikTok publishing provider.
 * Uses TikTok Content Posting API for video uploads.
 * Requires OAuth2 access token with video.upload scope.
 *
 * Flow: init upload → upload video → publish
 */
export function createTikTokPublishingProvider(
  credentials: Record<string, unknown>,
  _settings: Record<string, unknown>
): PublishingProvider {
  const accessToken = credentials.access_token as string;
  if (!accessToken) {
    throw new Error(
      "TikTok publishing requires an access_token in provider config (OAuth2)"
    );
  }

  const baseUrl = "https://open.tiktokapis.com/v2";

  return {
    async publish(input: PublishInput): Promise<PublishOutput> {
      if (!input.mediaUrls || input.mediaUrls.length === 0) {
        throw new Error("TikTok publishing requires at least one video URL in mediaUrls");
      }

      const videoUrl = input.mediaUrls[0];

      // Step 1: Download the video to get its size
      const videoRes = await fetch(videoUrl);
      if (!videoRes.ok) {
        throw new Error(`Failed to download video from ${videoUrl}: ${videoRes.status}`);
      }
      const videoBlob = await videoRes.blob();

      // Step 2: Initialize the upload
      const initRes = await fetch(`${baseUrl}/post/publish/video/init/`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json; charset=UTF-8",
        },
        body: JSON.stringify({
          post_info: {
            title: input.title.substring(0, 150),
            description: input.content.substring(0, 2200),
            privacy_level: "SELF_ONLY", // Start private, user changes in TikTok
            disable_duet: false,
            disable_stitch: false,
            disable_comment: false,
          },
          source_info: {
            source: "FILE_UPLOAD",
            video_size: videoBlob.size,
          },
        }),
      });

      if (!initRes.ok) {
        const errText = await initRes.text();
        throw new Error(`TikTok upload init error (${initRes.status}): ${errText}`);
      }

      const initData = await initRes.json();
      const publishId = initData.data?.publish_id;
      const uploadUrl = initData.data?.upload_url;

      if (!publishId || !uploadUrl) {
        throw new Error("TikTok did not return publish_id or upload_url");
      }

      // Step 3: Upload the video
      const uploadRes = await fetch(uploadUrl, {
        method: "PUT",
        headers: {
          "Content-Type": "video/mp4",
          "Content-Range": `bytes 0-${videoBlob.size - 1}/${videoBlob.size}`,
        },
        body: videoBlob,
      });

      if (!uploadRes.ok) {
        const errText = await uploadRes.text();
        throw new Error(`TikTok upload error (${uploadRes.status}): ${errText}`);
      }

      return {
        externalId: publishId,
        externalUrl: `https://www.tiktok.com/@me/video/${publishId}`,
        status: "processing",
      };
    },

    async getStatus(externalId: string) {
      const res = await fetch(
        `${baseUrl}/post/publish/status/fetch/`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ publish_id: externalId }),
        }
      );

      if (!res.ok) {
        return { status: "failed" as const, error: `Status check failed: ${res.status}` };
      }

      const data = await res.json();
      const status = data.data?.status;

      if (status === "PUBLISH_COMPLETE") {
        return {
          status: "published" as const,
          externalUrl: `https://www.tiktok.com/@me/video/${externalId}`,
          publishedAt: new Date().toISOString(),
        };
      } else if (status === "FAILED") {
        return {
          status: "failed" as const,
          error: data.data?.fail_reason || "Unknown error",
        };
      }

      return { status: "processing" as const };
    },
  };
}
