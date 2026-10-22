/**
 * Plain wording for upload failures. The raw messages from the network, the
 * storage service and the resumable-upload library are for developers, not
 * for someone adding photos from a phone, so they are translated here.
 */

export const CONNECTION_DROPPED = "The connection dropped. Tap Retry and it will carry on.";

export function friendlyTransportError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err ?? "");
  if (/cancel/i.test(message)) return "Cancelled.";
  const rejected = /rejected \((\d{3})\)/.exec(message) || /response code: (\d{3})/.exec(message);
  if (rejected) {
    const status = Number(rejected[1]);
    if (status === 413) return "That file is too big.";
    if (status === 401 || status === 403) return "The upload permission ran out. Tap Retry.";
    if (status === 415) return "That kind of file cannot be added.";
    if (status === 409) return "That file is already being added. Tap Retry in a moment.";
    return "That one did not upload. Tap Retry.";
  }
  if (/network|timed out|timeout|failed to fetch|load failed|offline|tus:/i.test(message)) return CONNECTION_DROPPED;
  return "That one did not upload. Tap Retry.";
}
