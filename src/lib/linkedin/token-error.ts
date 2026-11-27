/**
 * LinkedIn refused a token request. `code` is LinkedIn's own error name, for
 * example invalid_client (the app id or secret was rejected) or
 * invalid_grant (the code expired or was already used).
 */
export class LinkedInTokenError extends Error {
  constructor(message: string, readonly status: number, readonly code: string | null) {
    super(message);
    this.name = "LinkedInTokenError";
  }
}

export function tokenErrorCode(body: string): string | null {
  try {
    const code = (JSON.parse(body) as { error?: unknown }).error;
    return typeof code === "string" ? code : null;
  } catch {
    return null;
  }
}

/** What the person sees when the connection fails. Never includes LinkedIn's raw reply. */
export function connectionErrorMessage(err: unknown): string {
  if (err instanceof LinkedInTokenError && err.code === "invalid_client") {
    return "LinkedIn rejected the app credentials (the client ID or secret). Check them in the server settings, then try again.";
  }
  return "LinkedIn did not complete the connection. Try again.";
}
