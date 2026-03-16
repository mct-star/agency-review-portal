import type { PublishingProvider, PublishInput, PublishOutput } from "./types";

/**
 * Substack publishing provider.
 * Uses Substack's API endpoints (widely used though not officially documented).
 * Supports creating drafts and publishing posts, with optional newsletter send.
 */
export function createSubstackPublishingProvider(
  credentials: Record<string, unknown>,
  settings: Record<string, unknown>
): PublishingProvider {
  const apiKey = credentials.api_key as string;
  const subdomain = (settings.subdomain as string) || (credentials.subdomain as string);

  if (!apiKey || !subdomain) {
    throw new Error(
      "Substack publishing requires an API key and subdomain in provider config"
    );
  }

  const baseUrl = `https://${subdomain}.substack.com/api/v1`;

  return {
    async publish(input: PublishInput): Promise<PublishOutput> {
      // Create the post via Substack's API
      const body: Record<string, unknown> = {
        title: input.title,
        subtitle: input.subtitle || "",
        body_html: input.content,
        type: "newsletter",
        draft: false,
      };

      if (input.canonicalUrl) {
        body.canonical_url = input.canonicalUrl;
      }

      if (input.scheduledFor) {
        body.draft = true;
        body.scheduled_at = input.scheduledFor;
      }

      // If sendNewsletter is explicitly false, create as web-only post
      if (input.sendNewsletter === false) {
        body.audience = "everyone"; // Visible on web, but don't email
        body.write_comment_permissions = "everyone";
      }

      const res = await fetch(`${baseUrl}/drafts`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Substack API error (${res.status}): ${errText}`);
      }

      const data = await res.json();
      const postId = data.id || data.draft_id;
      const slug = data.slug || data.post_slug;

      // If not a draft, publish it
      if (!input.scheduledFor) {
        const publishRes = await fetch(`${baseUrl}/drafts/${postId}/publish`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            send: input.sendNewsletter !== false,
          }),
        });

        if (!publishRes.ok) {
          const publishErr = await publishRes.text();
          throw new Error(
            `Substack publish error (${publishRes.status}): ${publishErr}`
          );
        }
      }

      const externalUrl = `https://${subdomain}.substack.com/p/${slug || postId}`;

      return {
        externalId: String(postId),
        externalUrl,
        status: input.scheduledFor ? "scheduled" : "published",
      };
    },
  };
}
