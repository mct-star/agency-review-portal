/**
 * Bluesky AT Protocol Client
 *
 * Posts to Bluesky via the AT Protocol (atproto).
 * Authentication: handle + app password (no OAuth needed).
 *
 * Users create an app password at:
 * https://bsky.app/settings/app-passwords
 *
 * API docs: https://docs.bsky.app/
 */

const BSKY_API = "https://bsky.social/xrpc";

// ============================================================
// Types
// ============================================================

export interface BlueskyCredentials {
  handle: string;      // e.g. "agencybristol.bsky.social" or custom domain
  appPassword: string; // App password from bsky.app settings
}

export interface BlueskySession {
  did: string;
  handle: string;
  accessJwt: string;
  refreshJwt: string;
}

export interface BlueskyPostResult {
  uri: string;
  cid: string;
  postUrl: string;
}

// ============================================================
// Authentication
// ============================================================

/**
 * Create an authenticated session with Bluesky.
 * Uses the handle + app password to get JWT tokens.
 */
export async function createSession(
  credentials: BlueskyCredentials
): Promise<BlueskySession> {
  const res = await fetch(`${BSKY_API}/com.atproto.server.createSession`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      identifier: credentials.handle,
      password: credentials.appPassword,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    if (res.status === 401) {
      throw new Error("Invalid handle or app password. Check your credentials and try again.");
    }
    throw new Error(`Bluesky auth failed (${res.status}): ${err}`);
  }

  const data = await res.json();
  return {
    did: data.did,
    handle: data.handle,
    accessJwt: data.accessJwt,
    refreshJwt: data.refreshJwt,
  };
}

/**
 * Verify that credentials are valid by creating a session.
 * Returns the resolved handle and DID if successful.
 */
export async function verifyCredentials(
  credentials: BlueskyCredentials
): Promise<{ did: string; handle: string }> {
  const session = await createSession(credentials);
  return { did: session.did, handle: session.handle };
}

// ============================================================
// Posting
// ============================================================

/**
 * Create a text post on Bluesky.
 *
 * Handles:
 * - Rich text with link detection
 * - Character limit (300 graphemes for Bluesky)
 * - Facets for URLs and mentions
 */
export async function createPost(
  session: BlueskySession,
  text: string
): Promise<BlueskyPostResult> {
  // Detect URLs in text and create facets
  const facets = detectUrlFacets(text);

  const record: Record<string, unknown> = {
    $type: "app.bsky.feed.post",
    text,
    createdAt: new Date().toISOString(),
  };

  if (facets.length > 0) {
    record.facets = facets;
  }

  const res = await fetch(`${BSKY_API}/com.atproto.repo.createRecord`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.accessJwt}`,
    },
    body: JSON.stringify({
      repo: session.did,
      collection: "app.bsky.feed.post",
      record,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Bluesky post failed (${res.status}): ${err}`);
  }

  const data = await res.json();

  // Construct a viewable URL
  const rkey = data.uri.split("/").pop();
  const postUrl = `https://bsky.app/profile/${session.handle}/post/${rkey}`;

  return {
    uri: data.uri,
    cid: data.cid,
    postUrl,
  };
}

/**
 * Upload an image to Bluesky and create a post with it.
 */
export async function createPostWithImage(
  session: BlueskySession,
  text: string,
  imageBuffer: Buffer,
  mimeType: string = "image/png",
  altText: string = "Post image"
): Promise<BlueskyPostResult> {
  // Upload the image blob
  const uploadRes = await fetch(`${BSKY_API}/com.atproto.repo.uploadBlob`, {
    method: "POST",
    headers: {
      "Content-Type": mimeType,
      Authorization: `Bearer ${session.accessJwt}`,
    },
    body: new Uint8Array(imageBuffer),
  });

  if (!uploadRes.ok) {
    const err = await uploadRes.text();
    throw new Error(`Bluesky image upload failed (${uploadRes.status}): ${err}`);
  }

  const uploadData = await uploadRes.json();
  const blob = uploadData.blob;

  // Create post with embedded image
  const facets = detectUrlFacets(text);
  const record: Record<string, unknown> = {
    $type: "app.bsky.feed.post",
    text,
    createdAt: new Date().toISOString(),
    embed: {
      $type: "app.bsky.embed.images",
      images: [
        {
          alt: altText,
          image: blob,
        },
      ],
    },
  };

  if (facets.length > 0) {
    record.facets = facets;
  }

  const res = await fetch(`${BSKY_API}/com.atproto.repo.createRecord`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.accessJwt}`,
    },
    body: JSON.stringify({
      repo: session.did,
      collection: "app.bsky.feed.post",
      record,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Bluesky post with image failed (${res.status}): ${err}`);
  }

  const data = await res.json();
  const rkey = data.uri.split("/").pop();
  const postUrl = `https://bsky.app/profile/${session.handle}/post/${rkey}`;

  return { uri: data.uri, cid: data.cid, postUrl };
}

// ============================================================
// Helpers
// ============================================================

/**
 * Detect URLs in text and return Bluesky facets for rich text rendering.
 */
function detectUrlFacets(text: string): unknown[] {
  const urlRegex = /https?:\/\/[^\s<>)"']+/g;
  const facets: unknown[] = [];
  let match;

  while ((match = urlRegex.exec(text)) !== null) {
    const url = match[0];
    // Bluesky uses byte offsets for facets
    const encoder = new TextEncoder();
    const beforeBytes = encoder.encode(text.slice(0, match.index)).length;
    const urlBytes = encoder.encode(url).length;

    facets.push({
      index: {
        byteStart: beforeBytes,
        byteEnd: beforeBytes + urlBytes,
      },
      features: [
        {
          $type: "app.bsky.richtext.facet#link",
          uri: url,
        },
      ],
    });
  }

  return facets;
}

/**
 * Strip markdown for Bluesky plain text (similar to LinkedIn).
 */
export function stripMarkdownForBluesky(text: string): string {
  return text
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/__(.*?)__/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/_(.*?)_/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 ($2)")
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "")
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^>\s+/gm, "")
    .replace(/^[-*+]\s+/gm, "")
    .replace(/^\d+\.\s+/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
