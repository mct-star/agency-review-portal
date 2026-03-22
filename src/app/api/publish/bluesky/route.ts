import { NextResponse } from "next/server";
import { requireCompanyUser, createAdminSupabaseClient } from "@/lib/supabase/admin";
import { decrypt } from "@/lib/crypto";

/**
 * POST /api/publish/bluesky
 *
 * Publishes a post to Bluesky via the AT Protocol.
 * Handles session refresh if the access token has expired.
 *
 * Body: { companyId, text, imageUrl? }
 */
export async function POST(request: Request) {
  const body = await request.json();
  const { companyId, text, imageUrl } = body;

  if (!companyId) {
    return NextResponse.json({ error: "companyId is required" }, { status: 400 });
  }

  const profile = await requireCompanyUser(companyId);
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!companyId || !text) {
    return NextResponse.json({ error: "companyId and text are required" }, { status: 400 });
  }

  const supabase = await createAdminSupabaseClient();

  // Find active Bluesky account for this company
  const { data: account } = await supabase
    .from("company_social_accounts")
    .select("*")
    .eq("company_id", companyId)
    .eq("platform", "bluesky")
    .eq("is_active", true)
    .limit(1)
    .single();

  if (!account || !account.access_token_encrypted) {
    return NextResponse.json(
      { error: "No Bluesky account connected. Go to Setup > People > Social Accounts." },
      { status: 400 }
    );
  }

  let accessToken = decrypt(account.access_token_encrypted);
  const did = account.account_id;

  // Try to refresh the session if we have a refresh token
  async function refreshSession(): Promise<string | null> {
    if (!account.refresh_token_encrypted) return null;
    try {
      const refreshToken = decrypt(account.refresh_token_encrypted);
      const res = await fetch("https://bsky.social/xrpc/com.atproto.server.refreshSession", {
        method: "POST",
        headers: { Authorization: `Bearer ${refreshToken}` },
      });
      if (!res.ok) return null;
      const data = await res.json();

      // Update stored tokens
      const { encrypt: enc } = await import("@/lib/crypto");
      await supabase
        .from("company_social_accounts")
        .update({
          access_token_encrypted: enc(data.accessJwt),
          refresh_token_encrypted: data.refreshJwt ? enc(data.refreshJwt) : account.refresh_token_encrypted,
        })
        .eq("id", account.id);

      return data.accessJwt;
    } catch {
      return null;
    }
  }

  // Build the post record
  const now = new Date().toISOString();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const record: Record<string, any> = {
    $type: "app.bsky.feed.post",
    text,
    createdAt: now,
  };

  // Upload image if provided
  if (imageUrl) {
    try {
      const imgRes = await fetch(imageUrl);
      if (imgRes.ok) {
        const imgBuffer = await imgRes.arrayBuffer();
        const contentType = imgRes.headers.get("content-type") || "image/png";

        const uploadRes = await fetch("https://bsky.social/xrpc/com.atproto.repo.uploadBlob", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": contentType,
          },
          body: imgBuffer,
        });

        if (uploadRes.ok) {
          const uploadData = await uploadRes.json();
          record.embed = {
            $type: "app.bsky.embed.images",
            images: [
              {
                alt: text.slice(0, 100),
                image: uploadData.blob,
              },
            ],
          };
        }
      }
    } catch (imgErr) {
      console.warn("Bluesky image upload failed:", imgErr);
      // Continue without image
    }
  }

  // Create the post
  async function createPost(token: string) {
    return fetch("https://bsky.social/xrpc/com.atproto.repo.createRecord", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        repo: did,
        collection: "app.bsky.feed.post",
        record,
      }),
    });
  }

  let res = await createPost(accessToken);

  // If unauthorized, try refreshing the session
  if (res.status === 401) {
    const newToken = await refreshSession();
    if (newToken) {
      accessToken = newToken;
      res = await createPost(accessToken);
    }
  }

  if (!res.ok) {
    const errText = await res.text();
    return NextResponse.json(
      { error: `Bluesky post failed (${res.status}): ${errText}` },
      { status: 502 }
    );
  }

  const data = await res.json();

  return NextResponse.json({
    success: true,
    uri: data.uri,
    cid: data.cid,
    url: `https://bsky.app/profile/${account.account_name}/post/${data.uri.split("/").pop()}`,
  });
}
