import { NextResponse } from "next/server";
import { requireCompanyUser, createAdminSupabaseClient } from "@/lib/supabase/admin";
import { decrypt } from "@/lib/crypto";
import {
  createPost,
  createMultiImagePost,
  addComment,
  uploadImage,
  stripMarkdownForLinkedIn,
} from "@/lib/linkedin/client";

/**
 * POST /api/publish/linkedin-direct
 *
 * Lightweight endpoint for posting directly to LinkedIn from Quick Generate.
 * Unlike /api/publish/linkedin, this doesn't require a saved content_piece —
 * it takes raw text and an optional image URL.
 *
 * Body: {
 *   companyId: string,
 *   text: string,
 *   firstComment?: string,
 *   imageUrl?: string,
 *   carouselImageUrls?: string[],  // For carousel/multi-image posts
 * }
 */
export async function POST(request: Request) {
  const body = await request.json();
  const { companyId, text, firstComment, imageUrl, carouselImageUrls } = body;

  if (!companyId || !text) {
    return NextResponse.json(
      { error: "companyId and text are required" },
      { status: 400 }
    );
  }

  // Auth: admin or company member
  const profile = await requireCompanyUser(companyId);
  if (!profile) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = await createAdminSupabaseClient();

  // Fetch the LinkedIn social account
  const { data: accounts } = await supabase
    .from("company_social_accounts")
    .select("*")
    .eq("company_id", companyId)
    .eq("platform", "linkedin_personal")
    .eq("is_active", true)
    .limit(1);

  if (!accounts || accounts.length === 0) {
    return NextResponse.json(
      { error: "No active LinkedIn account connected. Set one up in your social accounts settings." },
      { status: 404 }
    );
  }

  const account = accounts[0];

  if (!account.access_token_encrypted) {
    return NextResponse.json(
      { error: "LinkedIn account has no access token. Please re-authorize." },
      { status: 400 }
    );
  }

  // Check token expiry
  if (account.token_expires_at) {
    const expiresAt = new Date(account.token_expires_at);
    if (expiresAt < new Date()) {
      return NextResponse.json(
        { error: "LinkedIn access token has expired. Please re-authorize." },
        { status: 401 }
      );
    }
  }

  const accessToken = decrypt(account.access_token_encrypted);
  const personUrn = account.account_id;

  if (!personUrn) {
    return NextResponse.json(
      { error: "LinkedIn account missing person ID" },
      { status: 400 }
    );
  }

  // Prepare text
  const postText = stripMarkdownForLinkedIn(text);

  // Upload images and create the post
  let postResult;

  // Carousel: upload multiple images and create multi-image post
  if (carouselImageUrls && Array.isArray(carouselImageUrls) && carouselImageUrls.length > 1) {
    try {
      const imageUrns: string[] = [];
      for (let i = 0; i < carouselImageUrls.length; i++) {
        const imgRes = await fetch(carouselImageUrls[i]);
        if (imgRes.ok) {
          const arrayBuffer = await imgRes.arrayBuffer();
          const imageBuffer = Buffer.from(arrayBuffer);
          const result = await uploadImage(
            accessToken,
            personUrn,
            imageBuffer,
            `carousel-slide-${i + 1}.png`
          );
          imageUrns.push(result.imageUrn);
        }
      }
      postResult = await createMultiImagePost(accessToken, personUrn, postText, imageUrns);
    } catch (postErr) {
      return NextResponse.json(
        { error: postErr instanceof Error ? postErr.message : "Carousel post creation failed" },
        { status: 500 }
      );
    }
  } else {
    // Single image post (or text-only)
    let imageUrn: string | undefined;
    if (imageUrl) {
      try {
        const imgRes = await fetch(imageUrl);
        if (imgRes.ok) {
          const arrayBuffer = await imgRes.arrayBuffer();
          const imageBuffer = Buffer.from(arrayBuffer);
          const result = await uploadImage(
            accessToken,
            personUrn,
            imageBuffer,
            "quick-generate-image.png"
          );
          imageUrn = result.imageUrn;
        }
      } catch (imgErr) {
        console.error("LinkedIn image upload failed (continuing without image):", imgErr);
      }
    }

    try {
      postResult = await createPost(accessToken, personUrn, postText, imageUrn);
    } catch (postErr) {
      return NextResponse.json(
        { error: postErr instanceof Error ? postErr.message : "Post creation failed" },
        { status: 500 }
      );
    }
  }

  // Add first comment if provided
  let commentResult = null;
  if (firstComment) {
    try {
      commentResult = await addComment(
        accessToken,
        postResult.postUrn,
        personUrn,
        firstComment
      );
    } catch (commentErr) {
      console.error("LinkedIn first comment failed:", commentErr);
    }
  }

  return NextResponse.json({
    success: true,
    post: {
      urn: postResult.postUrn,
      url: postResult.postUrl,
    },
    comment: commentResult ? { urn: commentResult.commentUrn } : null,
  });
}

/**
 * GET /api/publish/linkedin-direct?companyId=xxx
 *
 * Check if a company has an active LinkedIn connection.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const companyId = searchParams.get("companyId");

  if (!companyId) {
    return NextResponse.json({ connected: false });
  }

  const profile = await requireCompanyUser(companyId);
  if (!profile) {
    return NextResponse.json({ connected: false });
  }

  const supabase = await createAdminSupabaseClient();

  const { data: accounts } = await supabase
    .from("company_social_accounts")
    .select("id, account_name, token_expires_at, access_token_encrypted")
    .eq("company_id", companyId)
    .eq("platform", "linkedin_personal")
    .eq("is_active", true)
    .limit(1);

  if (!accounts || accounts.length === 0) {
    return NextResponse.json({ connected: false });
  }

  const account = accounts[0];

  // Check if access token actually exists
  if (!account.access_token_encrypted) {
    return NextResponse.json({
      connected: false,
      expired: false,
      noToken: true,
      accountName: account.account_name,
    });
  }

  // Check if token is expired
  if (account.token_expires_at) {
    const expiresAt = new Date(account.token_expires_at);
    if (expiresAt < new Date()) {
      return NextResponse.json({ connected: false, expired: true, accountName: account.account_name });
    }
  }

  return NextResponse.json({ connected: true, accountName: account.account_name });
}
