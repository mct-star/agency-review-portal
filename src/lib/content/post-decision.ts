/**
 * Send one approval decision through the route that records it
 * (/api/content/approve writes the content_approvals row with the version
 * hash before the status changes). Browser code uses this instead of
 * updating content_pieces directly, so no screen can approve a piece
 * without its record.
 */
export async function postDecision(
  pieceId: string,
  status: "approved" | "changes_requested",
  note?: string,
  fetcher: typeof fetch = fetch,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const res = await fetcher("/api/content/approve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(note ? { pieceId, status, note } : { pieceId, status }),
    });
    if (res.ok) return { ok: true };
    const json = await res.json().catch(() => ({}));
    return { ok: false, error: json.error || `failed (${res.status})` };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "failed" };
  }
}
