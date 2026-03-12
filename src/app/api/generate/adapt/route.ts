import { NextResponse } from "next/server";
import { requireAdmin, createAdminSupabaseClient } from "@/lib/supabase/admin";
import { getPlatformAdaptationProvider } from "@/lib/providers";
import type { SocialPlatform } from "@/types/database";

const PLATFORM_CHAR_LIMITS: Record<SocialPlatform, number> = {
  linkedin_personal: 3000,
  linkedin_company: 3000,
  twitter: 280,
  bluesky: 300,
  threads: 500,
  facebook: 63206,
  instagram: 2200,
};

/**
 * POST /api/generate/adapt
 * Generate platform-adapted variants for a content piece.
 *
 * Body: {
 *   contentPieceId: string,
 *   platforms: SocialPlatform[],  // which platforms to adapt for
 * }
 *
 * Creates a generation job, adapts the content for each platform,
 * and stores the variants in platform_variants.
 */
export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { contentPieceId, platforms } = body;

  if (!contentPieceId || !platforms || !Array.isArray(platforms) || platforms.length === 0) {
    return NextResponse.json(
      { error: "contentPieceId and platforms array are required" },
      { status: 400 }
    );
  }

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
      input_payload: { platforms },
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

    // Get the adaptation provider
    const { provider, providerName } = await getPlatformAdaptationProvider(
      piece.company_id
    );

    await supabase
      .from("content_generation_jobs")
      .update({ provider: providerName, progress: 20 })
      .eq("id", jobId);

    // Adapt for each platform sequentially
    const variants: {
      content_piece_id: string;
      platform: string;
      adapted_copy: string;
      adapted_first_comment: string | null;
      character_count: number;
      hashtags: string[];
      mentions: string[];
      is_selected: boolean;
      approval_status: string;
    }[] = [];

    const progressPerPlatform = 60 / platforms.length;

    for (let i = 0; i < platforms.length; i++) {
      const platform = platforms[i] as SocialPlatform;
      const maxChars = PLATFORM_CHAR_LIMITS[platform] || 3000;

      const result = await provider.adapt({
        originalCopy: piece.markdown_body,
        originalFirstComment: piece.first_comment,
        platform,
        maxChars,
        spokespersonName: company?.spokesperson_name || null,
        blueprintContent: blueprint?.blueprint_content,
      });

      variants.push({
        content_piece_id: contentPieceId,
        platform,
        adapted_copy: result.adaptedCopy,
        adapted_first_comment: result.adaptedFirstComment,
        character_count: result.characterCount,
        hashtags: result.hashtags,
        mentions: result.mentions,
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
          platforms,
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
