import { NextResponse } from "next/server";
import { requireAdmin, createAdminSupabaseClient } from "@/lib/supabase/admin";
import { getCharLimit, getDefaultAdaptationType } from "@/lib/platform-registry";
import { resolveAdaptationStrategy } from "@/lib/providers/content-adaptation/strategies";
import { resolveProvider } from "@/lib/providers";
import type { AdaptationType, DistributionPlatform } from "@/types/database";

interface PlatformRequest {
  platform: DistributionPlatform;
  adaptationType?: AdaptationType;
}

/**
 * POST /api/generate/adapt
 * Generate platform-adapted variants for a content piece.
 *
 * Body: {
 *   contentPieceId: string,
 *   platforms: DistributionPlatform[] | PlatformRequest[],
 * }
 *
 * Accepts either:
 *   - Simple string array: ["twitter", "bluesky"] (uses default adaptation per platform)
 *   - Object array: [{ platform: "twitter", adaptationType: "thread_expand" }]
 *
 * Creates a generation job, adapts the content for each platform using the
 * appropriate adaptation strategy, and stores variants in platform_variants.
 */
export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { contentPieceId, platforms: rawPlatforms } = body;

  if (!contentPieceId || !rawPlatforms || !Array.isArray(rawPlatforms) || rawPlatforms.length === 0) {
    return NextResponse.json(
      { error: "contentPieceId and platforms array are required" },
      { status: 400 }
    );
  }

  // Normalize to PlatformRequest[] (backward compatible with string[])
  const platformRequests: PlatformRequest[] = rawPlatforms.map(
    (p: string | PlatformRequest) =>
      typeof p === "string"
        ? { platform: p as DistributionPlatform, adaptationType: undefined }
        : p
  );

  const supabase = await createAdminSupabaseClient();

  // Fetch the content piece with company info
  const { data: piece } = await supabase
    .from("content_pieces")
    .select("*, week:weeks(*)")
    .eq("id", contentPieceId)
    .single();

  if (!piece) {
    return NextResponse.json({ error: "Content piece not found" }, { status: 404 });
  }

  // Create a generation job
  const { data: job, error: jobErr } = await supabase
    .from("content_generation_jobs")
    .insert({
      company_id: piece.company_id,
      week_id: piece.week_id,
      content_piece_id: contentPieceId,
      job_type: "platform_adaptation",
      status: "queued",
      input_payload: { platforms: platformRequests },
      progress: 0,
      triggered_by: admin.id,
    })
    .select()
    .single();

  if (jobErr || !job) {
    return NextResponse.json(
      { error: jobErr?.message || "Failed to create job" },
      { status: 500 }
    );
  }

  const jobId = job.id;

  try {
    await supabase
      .from("content_generation_jobs")
      .update({ status: "running", started_at: new Date().toISOString(), progress: 10 })
      .eq("id", jobId);

    // Fetch blueprint for voice context
    const { data: blueprint } = await supabase
      .from("company_blueprints")
      .select("blueprint_content")
      .eq("company_id", piece.company_id)
      .eq("is_active", true)
      .single();

    // Fetch company for spokesperson
    const { data: company } = await supabase
      .from("companies")
      .select("spokesperson_name")
      .eq("id", piece.company_id)
      .single();

    // Resolve credentials for the content_generation provider (used by all strategies)
    let credentials: Record<string, unknown> = {};
    let providerSettings: Record<string, unknown> = {};
    let providerName = "anthropic";
    try {
      const resolved = await resolveProvider(piece.company_id, "content_generation");
      if (resolved) {
        credentials = resolved.credentials;
        providerSettings = resolved.settings;
        providerName = resolved.provider;
      }
    } catch {
      // Fall back to env var if no provider configured
      credentials = {};
      providerSettings = {};
    }

    await supabase
      .from("content_generation_jobs")
      .update({ provider: providerName, progress: 20 })
      .eq("id", jobId);

    // Adapt for each platform sequentially
    const variants: Record<string, unknown>[] = [];
    const progressPerPlatform = 60 / platformRequests.length;

    for (let i = 0; i < platformRequests.length; i++) {
      const { platform, adaptationType: requestedType } = platformRequests[i];
      const adaptationType = requestedType || getDefaultAdaptationType(platform);
      const maxChars = getCharLimit(platform) || 3000;

      // Resolve the right strategy for this adaptation type
      const strategy = await resolveAdaptationStrategy(
        adaptationType,
        credentials,
        providerSettings
      );

      const result = await strategy.adapt({
        originalCopy: piece.markdown_body,
        originalFirstComment: piece.first_comment,
        contentType: piece.content_type,
        platform,
        adaptationType,
        maxChars,
        spokespersonName: company?.spokesperson_name || null,
        blueprintContent: blueprint?.blueprint_content,
        title: piece.title,
      });

      variants.push({
        content_piece_id: contentPieceId,
        platform,
        adaptation_type: adaptationType,
        adapted_copy: result.adaptedCopy,
        adapted_first_comment: result.adaptedFirstComment,
        character_count: result.characterCount,
        hashtags: result.hashtags,
        mentions: result.mentions,
        thread_parts: result.threadParts,
        canonical_url: result.canonicalUrl,
        media_urls: result.mediaUrls,
        platform_metadata: result.metadata,
        is_selected: true,
        approval_status: "pending",
      });

      await supabase
        .from("content_generation_jobs")
        .update({ progress: Math.round(20 + progressPerPlatform * (i + 1)) })
        .eq("id", jobId);
    }

    // Insert all variants
    const { data: insertedVariants, error: varErr } = await supabase
      .from("platform_variants")
      .insert(variants)
      .select();

    if (varErr) {
      throw new Error(varErr.message);
    }

    // Complete the job
    await supabase
      .from("content_generation_jobs")
      .update({
        status: "completed",
        progress: 100,
        completed_at: new Date().toISOString(),
        output_payload: {
          variantCount: insertedVariants?.length || 0,
          platforms: platformRequests,
        },
      })
      .eq("id", jobId);

    return NextResponse.json({
      jobId,
      status: "completed",
      variantCount: insertedVariants?.length || 0,
      variants: insertedVariants,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await supabase
      .from("content_generation_jobs")
      .update({
        status: "failed",
        error_message: message,
        completed_at: new Date().toISOString(),
      })
      .eq("id", jobId);

    return NextResponse.json({ jobId, status: "failed", error: message }, { status: 500 });
  }
}
