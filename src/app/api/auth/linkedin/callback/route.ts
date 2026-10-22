import { handleLinkedInCallback } from "@/lib/linkedin/oauth-callback";

/**
 * GET /api/auth/linkedin/callback?code=...&state=...
 *
 * LinkedIn redirects here after the user grants access. The state is signed
 * and the caller must be the admin who started the flow; see
 * src/lib/linkedin/oauth-callback.ts.
 */
export async function GET(request: Request) {
  return handleLinkedInCallback(request);
}
