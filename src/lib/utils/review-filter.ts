/** Weeks use ready_for_review where individual pieces use pending. */
export function matchesReviewFilter(status: string, text: string, filter: string, query: string): boolean {
  const statusMatches = !filter || status === filter || (filter === "pending" && (status === "ready_for_review" || status === "draft"));
  return statusMatches && text.toLocaleLowerCase("en-GB").includes(query.trim().toLocaleLowerCase("en-GB"));
}
