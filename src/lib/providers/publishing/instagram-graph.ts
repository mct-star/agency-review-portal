import type { PublishingProvider, PublishInput, PublishOutput } from "./types";

/**
 * Instagram Graph API publishing provider.
 * Used for Reels and carousel posts (not Stories — those require different API).
 * Requires a Facebook Page access token with instagram_content_publish scope.
 *
 * Flow: create media container → publish container
 */
export function createInstagramGraphPublishingProvider(
  credentials: Record<string, unknown>,
  settings: Record<string, unknown>
): PublishingProvider {
  const accessToken = credentials.access_token as string;
  const igUserId = (credentials.instagram_user_id || settings.instagram_user_id) as string;

  if (!accessToken || !igUserId) {
    throw new Error(
      "Instagram publishing requires access_token and instagram_user_id in provider config"
    );
  }

  const graphUrl = "https://graph.facebook.com/v19.0";

  return {
    async publish(input: PublishInput): Promise<PublishOutput> {
      if (!input.mediaUrls || input.mediaUrls.length === 0) {
        throw new Error("Instagram publishing requires at least one media URL");
      }

      const videoUrl = input.mediaUrls[0];
      const caption = input.content.substring(0, 2200);

      // Step 1: Create a media container
      const containerParams = new URLSearchParams({
        media_type: "REELS",
        video_url: videoUrl,
        caption,
        access_token: accessToken,
      });

      // Add cover image URL if provided
      if (input.mediaUrls.length > 1) {
        containerParams.set("cover_url", input.mediaUrls[1]);
      }

      const containerRes = await fetch(
        `${graphUrl}/${igUserId}/media?${containerParams.toString()}`,
        { method: "POST" }
      );

      if (!containerRes.ok) {
        const errText = await containerRes.text();
        throw new Error(
          `Instagram container creation error (${containerRes.status}): ${errText}`
        );
      }

      const containerData = await containerRes.json();
      const containerId = containerData.id;

      if (!containerId) {
        throw new Error("Instagram did not return a container ID");
      }

      // Step 2: Wait for container to be ready (poll status)
      let ready = false;
      let attempts = 0;
      const maxAttempts = 30; // 5 minutes at 10s intervals

      while (!ready && attempts < maxAttempts) {
        await new Promise((r) => setTimeout(r, 10000));
        attempts++;

        const statusRes = await fetch(
          `${graphUrl}/${containerId}?fields=status_code&access_token=${accessToken}`
        );

        if (statusRes.ok) {
          const statusData = await statusRes.json();
          if (statusData.status_code === "FINISHED") {
            ready = true;
          } else if (statusData.status_code === "ERROR") {
            throw new Error("Instagram media processing failed");
          }
        }
      }

      if (!ready) {
        throw new Error("Instagram media processing timed out after 5 minutes");
      }

      // Step 3: Publish the container
      const publishRes = await fetch(
        `${graphUrl}/${igUserId}/media_publish`,
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            creation_id: containerId,
            access_token: accessToken,
          }).toString(),
        }
      );

      if (!publishRes.ok) {
        const errText = await publishRes.text();
        throw new Error(
          `Instagram publish error (${publishRes.status}): ${errText}`
        );
      }

      const publishData = await publishRes.json();
      const mediaId = publishData.id;

      // Get the permalink
      const mediaRes = await fetch(
        `${graphUrl}/${mediaId}?fields=permalink&access_token=${accessToken}`
      );
      const mediaData = mediaRes.ok ? await mediaRes.json() : {};

      return {
        externalId: mediaId,
        externalUrl: mediaData.permalink || `https://www.instagram.com/p/${mediaId}/`,
        status: "published",
      };
    },
  };
}
