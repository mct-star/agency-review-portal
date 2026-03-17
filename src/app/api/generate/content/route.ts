import { NextResponse } from "next/server";
import { requireAdmin, createAdminSupabaseClient } from "@/lib/supabase/admin";
import { getContentProvider } from "@/lib/providers";
import type { ContentGenerationInput } from "@/lib/providers";

/**
 * POST /api/generate/content
 * Start a content generation job.
 *
 * Body: {
 *   companyId: string,
 *   weekId: string,
 *   topicId: string,           // topic_bank entry id
 *   contentType: string,
 *   additionalContext?: string, // optional extra instructions
 * }
 *
 * Flow:
 * 1. Creates a content_generation_jobs row (status: "queued")
 * 2. Fetches company blueprint + topic details
 * 3. Calls the configured content provider
 * 4. Creates the content_piece + any assets
 * 5. Updates the job to "completed"
 *
 * Returns the job ID immediately so the UI can poll for progress.
 * The actual generation runs inline (not background) since Vercel
 * serverless functions have a 60s timeout on Pro plan.
 */
export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { companyId, weekId, topicId, contentType, additionalContext, spokespersonName } = body;

  if (!companyId || !weekId || !topicId || !contentType) {
    return NextResponse.json(
      { error: "companyId, weekId, topicId, and contentType are required" },
      { status: 400 }
    );
  }

  const supabase = await createAdminSupabaseClient();

  // 1. Create the job record
  const { data: job, error: jobErr } = await supabase
    .from("content_generation_jobs")
    .insert({
      company_id: companyId,
      week_id: weekId,
      job_type: "content_generation",
      status: "queued",
      input_payload: { topicId, contentType, additionalContext },
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

  // Return the job ID immediately, then continue processing
  // (In production, this would be a background job — for now it runs inline)
  const jobId = job.id;

  try {
    // 2. Update status to running
    await supabase
      .from("content_generation_jobs")
      .update({ status: "running", started_at: new Date().toISOString(), progress: 10 })
      .eq("id", jobId);

    // 3. Fetch company, blueprint, topic, week, spokesperson
    const [companyRes, blueprintRes, topicRes, weekRes] = await Promise.all([
      supabase.from("companies").select("*").eq("id", companyId).single(),
      supabase
        .from("company_blueprints")
        .select("*")
        .eq("company_id", companyId)
        .eq("is_active", true)
        .single(),
      supabase.from("topic_bank").select("*").eq("id", topicId).single(),
      supabase.from("weeks").select("*").eq("id", weekId).single(),
    ]);

    if (!topicRes.data) {
      throw new Error("Topic not found");
    }
    if (!weekRes.data) {
      throw new Error("Week not found");
    }

    await supabase
      .from("content_generation_jobs")
      .update({ progress: 20 })
      .eq("id", jobId);

    // 4. Resolve the content provider
    const { provider, providerName } = await getContentProvider(companyId);

    await supabase
      .from("content_generation_jobs")
      .update({ provider: providerName, progress: 30 })
      .eq("id", jobId);

    // 5. Call the provider
    const input: ContentGenerationInput = {
      blueprintContent: blueprintRes.data?.blueprint_content || "No blueprint configured.",
      topicTitle: topicRes.data.title,
      topicDescription: topicRes.data.description,
      pillar: topicRes.data.pillar,
      audienceTheme: topicRes.data.audience_theme,
      contentType: contentType as ContentGenerationInput["contentType"],
      weekNumber: weekRes.data.week_number,
      spokespersonName: spokespersonName || companyRes.data?.spokesperson_name || null,
      additionalContext,
    };

    const output = await provider.generate(input);

    await supabase
      .from("content_generation_jobs")
      .update({ progress: 70 })
      .eq("id", jobId);

    // 6. Create the content piece
    // Get current max sort_order for this week
    const { data: existingPieces } = await supabase
      .from("content_pieces")
      .select("sort_order")
      .eq("week_id", weekId)
      .order("sort_order", { ascending: false })
      .limit(1);

    const nextSort = (existingPieces?.[0]?.sort_order ?? -1) + 1;

    const { data: piece, error: pieceErr } = await supabase
      .from("content_pieces")
      .insert({
        week_id: weekId,
        company_id: companyId,
        content_type: contentType,
        title: output.title,
        markdown_body: output.markdownBody,
        first_comment: output.firstComment,
        word_count: output.wordCount,
        post_type: output.postType,
        pillar: topicRes.data.pillar,
        audience_theme: topicRes.data.audience_theme,
        topic_bank_ref: `#${topicRes.data.topic_number}: ${topicRes.data.title}`,
        sort_order: nextSort,
        approval_status: "pending",
        generation_job_id: jobId,
      })
      .select()
      .single();

    if (pieceErr || !piece) {
      throw new Error(pieceErr?.message || "Failed to create content piece");
    }

    await supabase
      .from("content_generation_jobs")
      .update({ progress: 85, content_piece_id: piece.id })
      .eq("id", jobId);

    // 7. Create assets if any
    const assetRows: { content_piece_id: string; asset_type: string; text_content: string; sort_order: number }[] = [];

    if (output.assets && output.assets.length > 0) {
      output.assets.forEach((a, i) => {
        assetRows.push({
          content_piece_id: piece.id,
          asset_type: a.assetType,
          text_content: a.textContent,
          sort_order: i,
        });
      });
    }

    // Store image prompt as an asset so it is visible on the content piece page
    if (output.imagePrompt) {
      assetRows.push({
        content_piece_id: piece.id,
        asset_type: "image_prompt",
        text_content: output.imagePrompt,
        sort_order: assetRows.length,
      });
    }

    if (assetRows.length > 0) {
      await supabase.from("content_assets").insert(assetRows);
    }

    // 8. Mark topic as used
    await supabase
      .from("topic_bank")
      .update({ is_used: true, used_in_week_id: weekId })
      .eq("id", topicId);

    // 9. Complete the job
    await supabase
      .from("content_generation_jobs")
      .update({
        status: "completed",
        progress: 100,
        completed_at: new Date().toISOString(),
        output_payload: {
          contentPieceId: piece.id,
          title: output.title,
          wordCount: output.wordCount,
          assetCount: output.assets?.length || 0,
        },
      })
      .eq("id", jobId);

    return NextResponse.json({
      jobId,
      status: "completed",
      contentPieceId: piece.id,
    });
  } catch (err) {
    // Mark job as failed
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
