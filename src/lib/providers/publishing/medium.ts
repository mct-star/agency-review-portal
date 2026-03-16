import type { PublishingProvider, PublishInput, PublishOutput } from "./types";

/**
 * Medium publishing provider.
 * Uses Medium's official API (v1) for creating posts.
 * Requires an integration token from Medium settings.
 */
export function createMediumPublishingProvider(
  credentials: Record<string, unknown>,
  settings: Record<string, unknown>
): PublishingProvider {
  const token = credentials.integration_token as string;
  if (!token) {
    throw new Error(
      "Medium publishing requires an integration_token in provider config"
    );
  }

  const baseUrl = "https://api.medium.com/v1";
  const publishStatus = (settings.default_status as string) || "public";

  return {
    async publish(input: PublishInput): Promise<PublishOutput> {
      // First, get the authenticated user's ID
      const meRes = await fetch(`${baseUrl}/me`, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
      });

      if (!meRes.ok) {
        const errText = await meRes.text();
        throw new Error(`Medium API error fetching user (${meRes.status}): ${errText}`);
      }

      const meData = await meRes.json();
      const userId = meData.data?.id;
      if (!userId) {
        throw new Error("Could not determine Medium user ID");
      }

      // Create the post
      const postBody: Record<string, unknown> = {
        title: input.title,
        contentFormat: "markdown",
        content: input.content,
        publishStatus: input.scheduledFor ? "draft" : publishStatus,
      };

      if (input.canonicalUrl) {
        postBody.canonicalUrl = input.canonicalUrl;
      }

      if (input.tags && input.tags.length > 0) {
        // Medium allows max 5 tags
        postBody.tags = input.tags.slice(0, 5);
      }

      const postRes = await fetch(`${baseUrl}/users/${userId}/posts`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(postBody),
      });

      if (!postRes.ok) {
        const errText = await postRes.text();
        throw new Error(`Medium API error creating post (${postRes.status}): ${errText}`);
      }

      const postData = await postRes.json();
      const post = postData.data;

      return {
        externalId: post.id,
        externalUrl: post.url,
        status: post.publishStatus === "public" ? "published" : "draft",
      };
    },
  };
}
