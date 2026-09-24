import { NextResponse } from "next/server";
import { requireAdmin, createAdminSupabaseClient } from "@/lib/supabase/admin";
import { decrypt } from "@/lib/crypto";
import {
  createPost,
  addComment,
  uploadImage,
  createMultiImagePost,
} from "@/lib/linkedin/client";
import { toLinkedInText, escapeLittleText } from "@/lib/linkedin/post-text";
import { resolvePieceMedia } from "@/lib/content/piece-media";

/**
 * POST /api/publish/linkedin
 *
 * Publishes a content piece to LinkedIn as a personal post.
 *
 * Flow:
 * 1. Look up the content piece and its approved text
 * 2. Look up the company's LinkedIn social account (decrypts access token)
 * 3. If the piece has images, upload the first one to LinkedIn
 * 4. Create the post (text + optional image)
 * 5. If the piece has a first_comment, add it as a comment
 * 6. Create a publishing_jobs record for audit trail
 *
 * Body: {
 *   pieceId: string,           // Content piece to publish
 *   companyId: string,         // Company whose LinkedIn account to use
 *   socialAccountId?: string,  // Optional: specific social account ID
 *   dryRun?: boolean,          // If true, returns what would be posted without posting
 * }
 */
export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { pieceId, companyId, socialAccountId, dryRun } = body;

  if (!pieceId || !companyId) {
    return NextResponse.json(
      { error: "pieceId and companyId are required" },
      { status: 400 }
    );
  }

  const supabase = await createAdminSupabaseClient();

  // ── 1. Fetch the content piece ─────────────────────────────
  const { data: piece, error: pieceErr } = await supabase
    .from("content_pieces")
    .select("*")
    .eq("id", pieceId)
    .single();

  if (pieceErr || !piece) {
    return NextResponse.json(
      { error: pieceErr?.message || "Content piece not found" },
      { status: 404 }
    );
  }

  if (piece.approval_status !== "approved") {
    return NextResponse.json(
      { error: "Content piece must be approved before publishing" },
      { status: 400 }
    );
  }

  // ── 2. Fetch the LinkedIn social account ───────────────────
  let accountQuery = supabase
    .from("company_social_accounts")
    .select("*")
    .eq("company_id", companyId)
    .eq("platform", "linkedin_personal")
    .eq("is_active", true);

  if (socialAccountId) {
    accountQuery = accountQuery.eq("id", socialAccountId);
  }

  const { data: accounts, error: accountErr } = await accountQuery;

  if (accountErr || !accounts || accounts.length === 0) {
    return NextResponse.json(
      {
        error:
          `No active LinkedIn account found. Connect one at /setup/${companyId}/social`,
      },
      { status: 404 }
    );
  }

  // Prefer a row that actually has a token (handles duplicate rows)
  const accountWithToken = accounts.find((a: { access_token_encrypted: string | null }) => !!a.access_token_encrypted);
  const account = accountWithToken || accounts[0];

  if (!account.access_token_encrypted) {
    return NextResponse.json(
      { error: "LinkedIn account has no access token. Re-authorize." },
      { status: 400 }
    );
  }

  // Check token expiry
  if (account.token_expires_at) {
    const expiresAt = new Date(account.token_expires_at);
    if (expiresAt < new Date()) {
      return NextResponse.json(
        {
          error:
            `Your LinkedIn connection has expired. Reconnect it at /setup/${companyId}/social, then publish again.`,
        },
        { status: 401 }
      );
    }
  }

  const accessToken = decrypt(account.access_token_encrypted);
  const personUrn = account.account_id; // LinkedIn person sub

  if (!personUrn) {
    return NextResponse.json(
      { error: "LinkedIn account missing person ID (account_id)" },
      { status: 400 }
    );
  }

  // ── 3. The exact text and media the preview showed ────────
  // Same functions as LinkedInPreview, so approval means what it says.
  const postText = toLinkedInText(piece.markdown_body || "");
  const commentary = escapeLittleText(postText);
  const firstComment = piece.first_comment ? toLinkedInText(piece.first_comment) : null;

  const [{ data: images }, { data: mediaAssets }] = await Promise.all([
    supabase.from("content_images").select("public_url, filename, sort_order, dimensions").eq("content_piece_id", pieceId),
    supabase.from("content_assets").select("asset_type, file_url, text_content, asset_metadata").eq("content_piece_id", pieceId).not("file_url", "is", null),
  ]);
  const media = resolvePieceMedia(piece, images || [], mediaAssets || []);

  if (media.shape === "video" || media.shape === "document") {
    return NextResponse.json(
      { error: `This piece is a ${media.shape} post. Publishing ${media.shape}s to LinkedIn from the portal is not built yet, so nothing was posted.` },
      { status: 422 },
    );
  }
  const imageItems = media.items.filter((m) => m.kind === "image").slice(0, 20);

  // ── Never publish the same piece twice ─────────────────────
  if (!body.force) {
    const { data: already } = await supabase
      .from("publishing_jobs")
      .select("external_url, published_at")
      .eq("content_piece_id", pieceId)
      .eq("target_platform", "linkedin_personal")
      .eq("status", "published")
      .limit(1);
    if (already && already.length > 0) {
      return NextResponse.json(
        { error: "This piece is already on LinkedIn.", url: already[0].external_url, publishedAt: already[0].published_at },
        { status: 409 },
      );
    }
  }

  // ── DRY RUN: exactly what would be sent ────────────────────
  if (dryRun) {
    return NextResponse.json({
      dryRun: true,
      piece: { id: piece.id, title: piece.title, contentType: piece.content_type },
      postText,
      commentary,
      media: { shape: media.shape, urls: imageItems.map((m) => m.url) },
      firstComment,
      linkedInAccount: { name: account.account_name, personUrn: account.account_id },
    });
  }

  const recordFailure = async (message: string) => {
    await supabase.from("publishing_jobs").insert({
      company_id: companyId,
      content_piece_id: pieceId,
      target_platform: "linkedin_personal",
      social_account_id: account.id,
      status: "failed",
      error_message: message,
      publish_payload: { text: postText.substring(0, 200), images: imageItems.length },
      response_payload: {},
      triggered_by: admin.userId,
    });
    await supabase.from("content_pieces").update({ publish_status: "failed" }).eq("id", pieceId);
  };

  // ── 5. Upload every image. A failed upload stops the post: the
  //       preview promised the image, so text-only would be wrong. ──
  const imageUrns: string[] = [];
  for (const [i, item] of imageItems.entries()) {
    try {
      const imgRes = await fetch(item.url);
      if (!imgRes.ok) throw new Error(`could not read the image (${imgRes.status})`);
      const type = imgRes.headers.get("content-type") || "";
      const name = type.includes("png") ? "image.png" : type.includes("gif") ? "image.gif" : "image.jpg";
      const result = await uploadImage(accessToken, personUrn, Buffer.from(await imgRes.arrayBuffer()), name);
      imageUrns.push(result.imageUrn);
    } catch (imgErr) {
      const message = `Image ${i + 1} of ${imageItems.length} did not upload, so nothing was posted: ${imgErr instanceof Error ? imgErr.message : "unknown error"}`;
      await recordFailure(message);
      return NextResponse.json({ error: message }, { status: 502 });
    }
  }

  // ── 6. Create the post ─────────────────────────────────────
  let postResult;
  try {
    postResult = imageUrns.length > 1
      ? await createMultiImagePost(accessToken, personUrn, commentary, imageUrns)
      : await createPost(accessToken, personUrn, commentary, imageUrns[0]);
  } catch (postErr) {
    const message = postErr instanceof Error ? postErr.message : "Post creation failed";
    await recordFailure(message);
    return NextResponse.json({ error: message }, { status: 500 });
  }

  // ── 7. First comment. The post is live either way; a failed
  //       comment is reported back, never hidden. ───────────────
  let commentResult = null;
  let commentError: string | null = null;
  if (firstComment) {
    try {
      commentResult = await addComment(accessToken, postResult.postUrn, personUrn, firstComment);
    } catch (commentErr) {
      commentError = commentErr instanceof Error ? commentErr.message : "First comment failed";
    }
  }

  // ── 8. Record the publishing job ───────────────────────────
  const { data: job } = await supabase
    .from("publishing_jobs")
    .insert({
      company_id: companyId,
      content_piece_id: pieceId,
      target_platform: "linkedin_personal",
      social_account_id: account.id,
      status: "published",
      external_id: postResult.postUrn,
      external_url: postResult.postUrl,
      publish_payload: {
        textLength: postText.length,
        images: imageUrns.length,
        imageUrns,
        hasFirstComment: !!firstComment,
        commentUrn: commentResult?.commentUrn || null,
        commentError,
      },
      response_payload: {
        postUrn: postResult.postUrn,
        postUrl: postResult.postUrl,
      },
      published_at: new Date().toISOString(),
      triggered_by: admin.userId,
    })
    .select()
    .single();

  await supabase.from("content_pieces").update({ publish_status: "published" }).eq("id", pieceId);

  return NextResponse.json({
    success: true,
    commentError,
    post: {
      urn: postResult.postUrn,
      url: postResult.postUrl,
    },
    comment: commentResult
      ? { urn: commentResult.commentUrn }
      : null,
    publishingJobId: job?.id,
  });
}
