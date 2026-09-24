/**
 * Wait for the Mac to post a queued LinkedIn publish, then return the live
 * URL. The poller checks for work every few seconds, so this normally
 * settles well inside the limit; past it the job is still queued and the
 * caller says so rather than claiming failure.
 */
export async function awaitLinkedInPublish(jobId: string, limitMs = 150_000): Promise<{ url: string | null; commentError: string | null }> {
  const started = Date.now();
  while (Date.now() - started < limitMs) {
    await new Promise((r) => setTimeout(r, 3000));
    const res = await fetch(`/api/publish/linkedin?jobId=${encodeURIComponent(jobId)}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Status check failed (${res.status})`);
    if (data.status === "completed") return { url: data.url, commentError: data.commentError };
    if (data.status === "failed" || data.status === "cancelled") throw new Error(data.error || "LinkedIn did not accept the post");
  }
  throw new Error("Still queued: the Mac has not picked it up yet. Is the Mac awake? It will post as soon as it is.");
}
