/**
 * Fetch engagement metrics for a LinkedIn post using the Social Actions API.
 * LinkedIn API v202603.
 */
export async function fetchPostMetrics(
  accessToken: string,
  postUrn: string
): Promise<{
  likes: number;
  comments: number;
  shares: number;
}> {
  const encodedUrn = encodeURIComponent(postUrn);

  const res = await fetch(
    `https://api.linkedin.com/rest/socialActions/${encodedUrn}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "LinkedIn-Version": "202603",
        "X-Restli-Protocol-Version": "2.0.0",
      },
    }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`LinkedIn analytics failed (${res.status}): ${text}`);
  }

  const data = await res.json();

  return {
    likes: data.likesSummary?.totalLikes || 0,
    comments: data.commentsSummary?.totalFirstLevelComments || 0,
    shares: data.shareCount || 0,
  };
}
