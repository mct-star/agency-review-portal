/**
 * LinkedIn API v2 client for publishing posts with images and comments.
 *
 * Architecture:
 * 1. OAuth2 Authorization Code flow to get access tokens
 * 2. Image Upload: Register → PUT binary → get asset URN
 *    Video Upload: Initialize → PUT each part → finalize → wait until AVAILABLE
 * 3. Post Creation: POST /rest/posts with text + optional image or video URN
 * 4. First Comment: POST /rest/socialActions/{postUrn}/comments
 *
 * LinkedIn API versions:
 * - Community Management API (v2) for posts, comments, images
 * - OAuth 2.0 with OpenID Connect for authentication
 *
 * Required LinkedIn App scopes:
 * - openid, profile (user identity)
 * - w_member_social (create posts + comments on behalf of member)
 *
 * Token lifecycle:
 * - Access tokens expire in 60 days
 * - Refresh tokens expire in 365 days
 * - We store both encrypted in company_social_accounts
 */

// ============================================================
// Types
// ============================================================

export interface LinkedInTokens {
  accessToken: string;
  refreshToken?: string;
  expiresIn: number;       // seconds until expiry
  expiresAt: string;       // ISO date string
  scope: string;
}

export interface LinkedInProfile {
  sub: string;             // LinkedIn member URN (person ID)
  name: string;
  givenName: string;
  familyName: string;
  picture?: string;
  email?: string;
}

export interface LinkedInPostResult {
  postUrn: string;
  postUrl: string;
}

export interface LinkedInCommentResult {
  commentUrn: string;
}

export interface LinkedInImageUploadResult {
  imageUrn: string;
}

export interface LinkedInVideoUploadResult {
  videoUrn: string;
}

// ============================================================
// Constants
// ============================================================

const LINKEDIN_AUTH_URL = "https://www.linkedin.com/oauth/v2/authorization";
const LINKEDIN_TOKEN_URL = "https://www.linkedin.com/oauth/v2/accessToken";
const LINKEDIN_API_BASE = "https://api.linkedin.com";
const LINKEDIN_REQUEST_TIMEOUT_MS = 20_000;
const LINKEDIN_SCOPES = "openid profile w_member_social";

// ============================================================
// OAuth2 Flow
// ============================================================

/**
 * Generate the LinkedIn authorization URL that the admin clicks.
 * Redirects back to our callback URL with an authorization code.
 */
export function getAuthorizationUrl(
  clientId: string,
  redirectUri: string,
  state: string
): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    state,
    scope: LINKEDIN_SCOPES,
  });
  return `${LINKEDIN_AUTH_URL}?${params.toString()}`;
}

/**
 * Exchange an authorization code for access + refresh tokens.
 */
export async function exchangeCodeForTokens(
  code: string,
  clientId: string,
  clientSecret: string,
  redirectUri: string
): Promise<LinkedInTokens> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
  });

  const res = await fetch(LINKEDIN_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!res.ok) {
    const errorBody = await res.text();
    throw new Error(`LinkedIn token exchange failed (${res.status}): ${errorBody}`);
  }

  const data = await res.json();

  const expiresIn = data.expires_in || 5184000; // Default 60 days
  const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || undefined,
    expiresIn,
    expiresAt,
    scope: data.scope || LINKEDIN_SCOPES,
  };
}

/**
 * Refresh an expired access token using a refresh token.
 */
export async function refreshAccessToken(
  refreshToken: string,
  clientId: string,
  clientSecret: string
): Promise<LinkedInTokens> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
  });

  const res = await fetch(LINKEDIN_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!res.ok) {
    const errorBody = await res.text();
    throw new Error(`LinkedIn token refresh failed (${res.status}): ${errorBody}`);
  }

  const data = await res.json();

  const expiresIn = data.expires_in || 5184000;
  const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || refreshToken,
    expiresIn,
    expiresAt,
    scope: data.scope || LINKEDIN_SCOPES,
  };
}

// ============================================================
// User Profile
// ============================================================

/**
 * Get the authenticated user's LinkedIn profile.
 * Uses the OpenID Connect userinfo endpoint to get the member sub (person ID).
 */
export async function getProfile(accessToken: string): Promise<LinkedInProfile> {
  const res = await fetch(`${LINKEDIN_API_BASE}/v2/userinfo`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!res.ok) {
    const errorBody = await res.text();
    throw new Error(`LinkedIn profile fetch failed (${res.status}): ${errorBody}`);
  }

  const data = await res.json();

  return {
    sub: data.sub,
    name: data.name,
    givenName: data.given_name,
    familyName: data.family_name,
    picture: data.picture,
    email: data.email,
  };
}

// ============================================================
// Image Upload (3-step process)
// ============================================================

/**
 * Upload an image to LinkedIn for use in a post.
 *
 * Steps:
 * 1. Initialize upload — LinkedIn returns an upload URL and image URN
 * 2. PUT the binary image data to the upload URL
 * 3. Return the image URN to reference in the post
 */
export async function uploadImage(
  accessToken: string,
  personUrn: string,
  imageBuffer: Buffer,
  filename: string
): Promise<LinkedInImageUploadResult> {
  // Step 1: Initialize upload
  const initRes = await fetch(`${LINKEDIN_API_BASE}/rest/images?action=initializeUpload`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "LinkedIn-Version": "202603",
      "X-Restli-Protocol-Version": "2.0.0",
    },
    body: JSON.stringify({
      initializeUploadRequest: {
        owner: `urn:li:person:${personUrn}`,
      },
    }),
    signal: AbortSignal.timeout(LINKEDIN_REQUEST_TIMEOUT_MS),
  });

  if (!initRes.ok) {
    const errorBody = await initRes.text();
    throw new Error(`LinkedIn image init failed (${initRes.status}): ${errorBody}`);
  }

  const initData = await initRes.json();
  const uploadUrl = initData.value.uploadUrl;
  const imageUrn = initData.value.image;

  // Step 2: PUT the binary image data
  const contentType = filename.endsWith(".png")
    ? "image/png"
    : filename.endsWith(".gif")
    ? "image/gif"
    : "image/jpeg";

  const uploadRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": contentType,
    },
    body: new Uint8Array(imageBuffer),
    signal: AbortSignal.timeout(LINKEDIN_REQUEST_TIMEOUT_MS),
  });

  if (!uploadRes.ok) {
    const errorBody = await uploadRes.text();
    throw new Error(`LinkedIn image upload failed (${uploadRes.status}): ${errorBody}`);
  }

  return { imageUrn };
}

// ============================================================
// Video Upload (multi-part, then processing)
// ============================================================

const LINKEDIN_VIDEO_PART_TIMEOUT_MS = 60_000;

/**
 * Upload an MP4 to LinkedIn for use in a post.
 *
 * Steps:
 * 1. Initialize upload with the file size. LinkedIn returns the video URN, an
 *    upload token and one upload URL per byte range (about 4 MB each).
 * 2. PUT each byte range to its URL and keep the ETag LinkedIn returns.
 * 3. Finalize with the ETags in order.
 * 4. Wait until LinkedIn reports the video AVAILABLE, so the post that
 *    references it is not rejected while the video is still processing.
 */
export async function uploadVideo(
  accessToken: string,
  personUrn: string,
  videoBuffer: Buffer,
  { pollIntervalMs = 3_000, maxWaitMs = 60_000 }: { pollIntervalMs?: number; maxWaitMs?: number } = {}
): Promise<LinkedInVideoUploadResult> {
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
    "LinkedIn-Version": "202603",
    "X-Restli-Protocol-Version": "2.0.0",
  };

  // Step 1: Initialize upload
  const initRes = await fetch(`${LINKEDIN_API_BASE}/rest/videos?action=initializeUpload`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      initializeUploadRequest: {
        owner: `urn:li:person:${personUrn}`,
        fileSizeBytes: videoBuffer.byteLength,
        uploadCaptions: false,
        uploadThumbnail: false,
      },
    }),
    signal: AbortSignal.timeout(LINKEDIN_REQUEST_TIMEOUT_MS),
  });

  if (!initRes.ok) {
    const errorBody = await initRes.text();
    throw new Error(`LinkedIn video init failed (${initRes.status}): ${errorBody}`);
  }

  const initData = await initRes.json();
  const videoUrn: string | undefined = initData.value?.video;
  const uploadToken: string = initData.value?.uploadToken ?? "";
  const instructions: Array<{ uploadUrl: string; firstByte: number; lastByte: number }> =
    initData.value?.uploadInstructions ?? [];
  if (!videoUrn || instructions.length === 0) {
    throw new Error("LinkedIn video init returned no upload instructions");
  }

  // Step 2: PUT each byte range. The upload URLs are pre-signed.
  const uploadedPartIds: string[] = [];
  for (const part of instructions) {
    const partRes = await fetch(part.uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": "application/octet-stream" },
      body: new Uint8Array(videoBuffer.subarray(part.firstByte, part.lastByte + 1)),
      signal: AbortSignal.timeout(LINKEDIN_VIDEO_PART_TIMEOUT_MS),
    });
    if (!partRes.ok) {
      const errorBody = await partRes.text();
      throw new Error(`LinkedIn video upload failed (${partRes.status}): ${errorBody}`);
    }
    const etag = partRes.headers.get("etag");
    if (!etag) throw new Error("LinkedIn video upload returned no part ID");
    uploadedPartIds.push(etag);
  }

  // Step 3: Finalize
  const finalizeRes = await fetch(`${LINKEDIN_API_BASE}/rest/videos?action=finalizeUpload`, {
    method: "POST",
    headers,
    body: JSON.stringify({ finalizeUploadRequest: { video: videoUrn, uploadToken, uploadedPartIds } }),
    signal: AbortSignal.timeout(LINKEDIN_REQUEST_TIMEOUT_MS),
  });
  if (!finalizeRes.ok) {
    const errorBody = await finalizeRes.text();
    throw new Error(`LinkedIn video finalize failed (${finalizeRes.status}): ${errorBody}`);
  }

  // Step 4: Wait for processing
  const deadline = Date.now() + maxWaitMs;
  for (;;) {
    const statusRes = await fetch(`${LINKEDIN_API_BASE}/rest/videos/${encodeURIComponent(videoUrn)}`, {
      headers,
      signal: AbortSignal.timeout(LINKEDIN_REQUEST_TIMEOUT_MS),
    });
    if (!statusRes.ok) {
      const errorBody = await statusRes.text();
      throw new Error(`LinkedIn video status failed (${statusRes.status}): ${errorBody}`);
    }
    const status = (await statusRes.json()).status;
    if (status === "AVAILABLE") return { videoUrn };
    if (status === "PROCESSING_FAILED") throw new Error("LinkedIn could not process the video");
    if (Date.now() + pollIntervalMs > deadline) throw new Error("LinkedIn was still processing the video when the wait ran out");
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }
}

// ============================================================
// Post Creation
// ============================================================

/**
 * Create a LinkedIn post (text-only, with an image, or with a video).
 *
 * @param accessToken - OAuth access token
 * @param personUrn - The member's person ID (from profile.sub)
 * @param text - The post body text
 * @param imageUrn - Optional image URN from uploadImage() or video URN from uploadVideo()
 * @param mediaTitle - Title LinkedIn shows with the media (a video's title)
 * @returns The post URN and URL
 */
export async function createPost(
  accessToken: string,
  personUrn: string,
  text: string,
  imageUrn?: string,
  mediaTitle = "Post image"
): Promise<LinkedInPostResult> {
  const postBody: Record<string, unknown> = {
    author: `urn:li:person:${personUrn}`,
    commentary: text,
    visibility: "PUBLIC",
    distribution: {
      feedDistribution: "MAIN_FEED",
      targetEntities: [],
      thirdPartyDistributionChannels: [],
    },
    lifecycleState: "PUBLISHED",
  };

  // Add image or video content if provided
  if (imageUrn) {
    postBody.content = {
      media: {
        title: mediaTitle,
        id: imageUrn,
      },
    };
  }

  const res = await fetch(`${LINKEDIN_API_BASE}/rest/posts`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "LinkedIn-Version": "202603",
      "X-Restli-Protocol-Version": "2.0.0",
    },
    body: JSON.stringify(postBody),
    signal: AbortSignal.timeout(LINKEDIN_REQUEST_TIMEOUT_MS),
  });

  if (!res.ok) {
    const errorBody = await res.text();
    throw new Error(`LinkedIn post creation failed (${res.status}): ${errorBody}`);
  }

  // LinkedIn returns the post URN in the x-restli-id header
  const postId = res.headers.get("x-restli-id") || "";
  if (!postId) throw new Error("LinkedIn accepted a post request without returning its post ID");
  const postUrn = postId.startsWith("urn:") ? postId : `urn:li:share:${postId}`;

  // Construct a viewable URL
  const postUrl = `https://www.linkedin.com/feed/update/${encodeURIComponent(postUrn)}/`;

  return { postUrn, postUrl };
}

/**
 * Create a multi-image (carousel) LinkedIn post.
 * Each image must be uploaded first via uploadImage(), then their URNs
 * are passed here as an array.
 *
 * LinkedIn displays these as a swipeable carousel.
 */
export async function createMultiImagePost(
  accessToken: string,
  personUrn: string,
  text: string,
  imageUrns: string[]
): Promise<LinkedInPostResult> {
  const postBody: Record<string, unknown> = {
    author: `urn:li:person:${personUrn}`,
    commentary: text,
    visibility: "PUBLIC",
    distribution: {
      feedDistribution: "MAIN_FEED",
      targetEntities: [],
      thirdPartyDistributionChannels: [],
    },
    lifecycleState: "PUBLISHED",
    content: {
      multiImage: {
        images: imageUrns.map((urn) => ({
          id: urn,
          altText: "Carousel slide",
        })),
      },
    },
  };

  const res = await fetch(`${LINKEDIN_API_BASE}/rest/posts`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "LinkedIn-Version": "202603",
      "X-Restli-Protocol-Version": "2.0.0",
    },
    body: JSON.stringify(postBody),
    signal: AbortSignal.timeout(LINKEDIN_REQUEST_TIMEOUT_MS),
  });

  if (!res.ok) {
    const errorBody = await res.text();
    throw new Error(`LinkedIn multi-image post failed (${res.status}): ${errorBody}`);
  }

  const postId = res.headers.get("x-restli-id") || "";
  if (!postId) throw new Error("LinkedIn accepted a post request without returning its post ID");
  const postUrn = postId.startsWith("urn:") ? postId : `urn:li:share:${postId}`;
  const postUrl = `https://www.linkedin.com/feed/update/${encodeURIComponent(postUrn)}/`;

  return { postUrn, postUrl };
}

// ============================================================
// First Comment
// ============================================================

/**
 * Add a comment to a LinkedIn post (used for first comment CTA).
 *
 * @param accessToken - OAuth access token
 * @param postUrn - The URN of the post to comment on
 * @param personUrn - The commenter's person ID
 * @param text - The comment text
 */
export async function addComment(
  accessToken: string,
  postUrn: string,
  personUrn: string,
  text: string
): Promise<LinkedInCommentResult> {
  const res = await fetch(
    `${LINKEDIN_API_BASE}/rest/socialActions/${encodeURIComponent(postUrn)}/comments`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "LinkedIn-Version": "202603",
        "X-Restli-Protocol-Version": "2.0.0",
      },
      body: JSON.stringify({
        actor: `urn:li:person:${personUrn}`,
        object: postUrn,
        message: {
          text,
        },
      }),
      signal: AbortSignal.timeout(LINKEDIN_REQUEST_TIMEOUT_MS),
    }
  );

  if (!res.ok) {
    const errorBody = await res.text();
    throw new Error(`LinkedIn comment failed (${res.status}): ${errorBody}`);
  }

  const commentUrn = res.headers.get("x-restli-id") || "";

  return { commentUrn };
}

// ============================================================
// Utility: Strip markdown for LinkedIn plain text
// ============================================================

/**
 * Strip markdown formatting from text to produce LinkedIn-compatible plain text.
 * LinkedIn posts don't support markdown — bold, italic, headings all render as raw characters.
 */
export function stripMarkdownForLinkedIn(text: string): string {
  return text
    .replace(/\*\*(.*?)\*\*/g, "$1")       // Bold
    .replace(/__(.*?)__/g, "$1")            // Bold alt
    .replace(/\*(.*?)\*/g, "$1")            // Italic
    .replace(/_(.*?)_/g, "$1")              // Italic alt
    .replace(/^#{1,6}\s+/gm, "")           // Headings
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 ($2)")  // Links: keep text + URL
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "") // Images: remove entirely
    .replace(/```[\s\S]*?```/g, "")         // Code blocks: remove
    .replace(/`([^`]+)`/g, "$1")            // Inline code: keep text
    .replace(/^>\s+/gm, "")                // Blockquotes: remove marker
    .replace(/^[-*+]\s+/gm, "")            // Unordered lists: remove bullet
    .replace(/^\d+\.\s+/gm, "")            // Ordered lists: remove number
    .replace(/\n{3,}/g, "\n\n")            // Collapse multiple blank lines
    .replace(/\n(?:#\w+\s*)+$/g, "")      // Strip trailing hashtag lines
    .replace(/#\w+/g, "")                 // Strip any remaining hashtags
    .replace(/\n{3,}/g, "\n\n")            // Re-collapse after hashtag removal
    .trim();
}
