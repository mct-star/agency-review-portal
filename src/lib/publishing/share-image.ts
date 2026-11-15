/**
 * The share image upload limit (15 Nov 2026), shared by the route and the
 * panel. The host refuses a function request body over 4.5 MB before the
 * handler runs, so the cap sits below that with room for the form wrapper.
 * Pure: safe to import in the browser.
 */

export const MAX_SHARE_BYTES = 4 * 1024 * 1024;
export const SHARE_TOO_LARGE = "That file is too large. The share image must be 4 MB or smaller.";

/** Why a chosen file cannot be sent, or null when it can. Checked in the browser before uploading. */
export function shareFileProblem(file: { size: number }): string | null {
  return file.size > MAX_SHARE_BYTES ? SHARE_TOO_LARGE : null;
}

/**
 * The error to show for a failed upload response. A 413, or a body that is
 * not JSON (the host's own refusal of a large body), is the size sentence.
 */
export function shareUploadError(status: number, body: unknown): string {
  if (status === 413 || !body || typeof body !== "object") return SHARE_TOO_LARGE;
  const error = (body as { error?: unknown }).error;
  return typeof error === "string" && error ? error : "The share image could not be uploaded.";
}
