import { NextResponse } from "next/server";
import { requireAdmin, createAdminSupabaseClient } from "@/lib/supabase/admin";
import { decrypt } from "@/lib/crypto";
import {
  createPost,
  addComment,
  uploadImage,
  stripMarkdownForLinkedIn,
} from "@/lib/linkedin/client";
import type { ContentImage } from "@/types/database";

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
          "No active LinkedIn account found. Connect one at /admin/companies/[id]/social-accounts",
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
            "LinkedIn access token has expired. Re-authorize at /admin/companies/[id]/social-accounts",
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

  // ── 3. Prepare the post text ───────────────────────────────
  const rawBody = piece.markdown_body || "";
  const postText = stripMarkdownForLinkedIn(rawBody);
  console.log("[LinkedIn Publish] Raw body length:", rawBody.length, "Stripped length:", postText.length);
  console.log("[LinkedIn Publish] Last 100 chars:", JSON.stringify(postText.slice(-100)));
  console.log("[LinkedIn Publish] First 100 chars:", JSON.stringify(postText.slice(0, 100)));

  // ── 4. Fetch images for the piece ──────────────────────────
  const { data: images } = await supabase
    .from("content_images")
    .select("*")
    .eq("content_piece_id", pieceId)
    .order("sort_order", { ascending: true })
    .limit(1);

  const firstImage = (images && images.length > 0) ? images[0] as ContentImage : null;

  // ── DRY RUN ────────────────────────────────────────────────
  if (dryRun) {
    return NextResponse.json({
      dryRun: true,
      piece: {
        id: piece.id,
        title: piece.title,
        contentType: piece.content_type,
        dayOfWeek: piece.day_of_week,
        scheduledTime: piece.scheduled_time,
      },
      postText: postText.substring(0, 500) + (postText.length > 500 ? "..." : ""),
      postTextLength: postText.length,
      hasImage: !!firstImage,
      imageUrl: firstImage?.public_url || null,
      hasFirstComment: !!piece.first_comment,
      firstComment: piece.first_comment?.substring(0, 200) || null,
      linkedInAccount: {
        name: account.account_name,
        personUrn: account.account_id,
      },
    });
  }

  // ── 5. Upload image (if any) ───────────────────────────────
  let imageUrn: string | undefined;

  if (firstImage?.public_url) {
    try {
      // Download the image from our storage
      const imgRes = await fetch(firstImage.public_url);
      if (imgRes.ok) {
        const arrayBuffer = await imgRes.arrayBuffer();
        const imageBuffer = Buffer.from(arrayBuffer);
        const result = await uploadImage(
          accessToken,
          personUrn,
          imageBuffer,
          firstImage.filename
        );
        imageUrn = result.imageUrn;
      }
    } catch (imgErr) {
      console.error("LinkedIn image upload failed (continuing without image):", imgErr);
      // Continue without image rather than failing the whole post
    }
  }

  // ── 6. Create the post ─────────────────────────────────────
  let postResult;
  try {
    postResult = await createPost(accessToken, personUrn, postText, imageUrn);
  } catch (postErr) {
    // Record failure
    await supabase.from("publishing_jobs").insert({
      company_id: companyId,
      content_piece_id: pieceId,
      target_platform: "linkedin_personal",
      social_account_id: account.id,
      status: "failed",
      error_message: postErr instanceof Error ? postErr.message : "Unknown error",
      publish_payload: { text: postText.substring(0, 200), hasImage: !!imageUrn },
      response_payload: {},
      triggered_by: admin.userId,
    });

    return NextResponse.json(
      { error: postErr instanceof Error ? postErr.message : "Post creation failed" },
      { status: 500 }
    );
  }

  // ── 7. Add first comment (if any) ──────────────────────────
  let commentResult = null;

  if (piece.first_comment) {
    try {
      commentResult = await addComment(
        accessToken,
        postResult.postUrn,
        personUrn,
        piece.first_comment
      );
    } catch (commentErr) {
      console.error("LinkedIn first comment failed:", commentErr instanceof Error ? commentErr.message : commentErr);
      console.error("LinkedIn first comment details - postUrn:", postResult.postUrn, "personUrn:", personUrn);
      // Don't fail the whole publish if the comment fails
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
        hasImage: !!imageUrn,
        imageUrn: imageUrn || null,
        hasFirstComment: !!piece.first_comment,
        commentUrn: commentResult?.commentUrn || null,
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

  return NextResponse.json({
    success: true,
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
