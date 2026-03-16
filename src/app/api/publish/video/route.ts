import { NextResponse } from "next/server";
import { requireAdmin, createAdminSupabaseClient } from "@/lib/supabase/admin";
import { resolveProvider } from "@/lib/providers";
import type { PublishingProvider } from "@/lib/providers/publishing/types";

/**
 * POST /api/publish/video
 * Upload a rendered video to a video platform (YouTube, TikTok, Instagram Reels).
 *
 * Body: {
 *   contentPieceId: string,
 *   targetPlatform: "youtube" | "youtube_shorts" | "tiktok" | "instagram",
 *   videoUrl: string,             // URL of the rendered video file
 *   title: string,
 *   description: string,
 *   tags?: string[],
 *   scheduledFor?: string,
 *   platformVariantId?: string,   // Use metadata from this variant
 * }
 */
export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const {
    contentPieceId,
    targetPlatform,
    videoUrl,
    title,
    description,
    tags,
    scheduledFor,
    platformVariantId,
  } = body;

  if (!contentPieceId || !targetPlatform || !videoUrl) {
    return NextResponse.json(
      { error: "contentPieceId, targetPlatform, and videoUrl are required" },
      { status: 400 }
    );
  }

  const validPlatforms = ["youtube", "youtube_shorts", "tiktok", "instagram"];
  if (!validPlatforms.includes(targetPlatform)) {
    return NextResponse.json(
      { error: `targetPlatform must be one of: ${validPlatforms.join(", ")}` },
      { status: 400 }
    );
  }

  const supabase = await createAdminSupabaseClient();

  // Fetch the content piece
  const { data: piece } = await supabase
    .from("content_pieces")
    .select("*")
    .eq("id", contentPieceId)
    .single();

  if (!piece) {
    return NextResponse.json({ error: "Content piece not found" }, { status: 404 });
  }

  // Get metadata from variant if provided
  let effectiveTitle = title || piece.title;
  let effectiveDescription = description || piece.markdown_body;
  let effectiveTags = tags || [];

  if (platformVariantId) {
    const { data: variant } = await supabase
      .from("platform_variants")
      .select("adapted_copy, platform_metadata")
      .eq("id", platformVariantId)
      .single();

    if (variant) {
      const metadata = variant.platform_metadata as Record<string, unknown>;
      if (typeof metadata?.title === "string") effectiveTitle = metadata.title;
      if (typeof metadata?.description === "string")
        effectiveDescription = metadata.description;
      if (Array.isArray(metadata?.tags)) effectiveTags = metadata.tags as string[];
    }
  }

  // Resolve the video hosting provider
  const resolved = await resolveProvider(piece.company_id, "video_hosting");
  if (!resolved) {
    return NextResponse.json(
      {
        error:
          "No video_hosting provider configured for this company. Add one in Company Settings → API Providers.",
      },
      { status: 400 }
    );
  }

  // Create the provider based on target platform
  let provider: PublishingProvider;
  if (targetPlatform === "youtube" || targetPlatform === "youtube_shorts") {
    const { createYouTubePublishingProvider } = await import(
      "@/lib/providers/publishing/youtube"
    );
    provider = createYouTubePublishingProvider(
      resolved.credentials,
      resolved.settings
    );
  } else if (targetPlatform === "tiktok") {
    const { createTikTokPublishingProvider } = await import(
      "@/lib/providers/publishing/tiktok"
    );
    provider = createTikTokPublishingProvider(
      resolved.credentials,
      resolved.settings
    );
  } else {
    const { createInstagramGraphPublishingProvider } = await import(
      "@/lib/providers/publishing/instagram-graph"
    );
    provider = createInstagramGraphPublishingProvider(
      resolved.credentials,
      resolved.settings
    );
  }

  try {
    const result = await provider.publish({
      title: effectiveTitle,
      content: effectiveDescription,
      mediaUrls: [videoUrl],
      tags: effectiveTags,
      scheduledFor,
    });

    // Create publishing job record
    await supabase.from("publishing_jobs").insert({
      company_id: piece.company_id,
      content_piece_id: contentPieceId,
      platform_variant_id: platformVariantId || null,
      target_platform: targetPlatform,
      status: result.status === "published" ? "published" : "running",
      external_id: result.externalId,
      external_url: result.externalUrl,
      published_at:
        result.status === "published" ? new Date().toISOString() : null,
      triggered_by: admin.id,
    });

    return NextResponse.json({
      status: result.status,
      externalUrl: result.externalUrl,
      externalId: result.externalId,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: `Video publishing failed: ${message}` },
      { status: 500 }
    );
  }
}
