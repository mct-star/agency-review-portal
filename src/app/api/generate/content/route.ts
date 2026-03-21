import { NextResponse } from "next/server";
import { requireAdmin, createAdminSupabaseClient } from "@/lib/supabase/admin";
import { getContentProvider } from "@/lib/providers";
import type { ContentGenerationInput } from "@/lib/providers";
import { getEcosystemRole } from "@/lib/generation/cta-resolver";

export const maxDuration = 120;

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
  const {
    companyId,
    weekId,
    topicId,
    contentType,
    additionalContext,
    spokespersonName,
    // Slot-specific fields (from posting schedule)
    postingSlotId,
    postTypeSlug,
    postTypeLabel,
    templateInstructions,
    wordCountMin,
    wordCountMax,
    imageArchetype,
    ctaUrl,
    ctaLinkText,
    ctaTier,
    ecosystemRole,
    blogTitle,
    blogUrl,
    dayOfWeek,
    scheduledTime,
    slotLabel,
  } = body;

  if (!companyId || !weekId || !contentType) {
    return NextResponse.json(
      { error: "companyId, weekId, and contentType are required" },
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

    // 3. Fetch company, blueprint, topic (optional), week, and sign-offs
    const isValidTopicId = topicId && topicId !== "auto" && topicId !== "null";
    const [companyRes, blueprintRes, topicRes, weekRes, signoffsRes] = await Promise.all([
      supabase.from("companies").select("*").eq("id", companyId).single(),
      supabase
        .from("company_blueprints")
        .select("*")
        .eq("company_id", companyId)
        .eq("is_active", true)
        .single(),
      isValidTopicId
        ? supabase.from("topic_bank").select("*").eq("id", topicId).single()
        : Promise.resolve({ data: null, error: null }),
      supabase.from("weeks").select("*").eq("id", weekId).single(),
      // Fetch all company sign-offs so the AI uses the real configured text
      supabase
        .from("company_signoffs")
        .select("*")
        .eq("company_id", companyId)
        .order("sort_order")
        .limit(10),
    ]);

    if (!weekRes.data) {
      throw new Error("Week not found");
    }

    // Topic is optional — in cohesive mode, the topic title comes from the request body
    const topic = topicRes.data;

    // Pick a sign-off to use.
    // Priority: a signoff whose applies_to_post_types includes the current post type slug.
    // Fallback: a signoff with an empty applies_to_post_types array (the default).
    const signoffs = signoffsRes.data || [];
    const matchedSignoff = postTypeSlug
      ? signoffs.find(
          (s) =>
            Array.isArray(s.applies_to_post_types) &&
            s.applies_to_post_types.length > 0 &&
            s.applies_to_post_types.includes(postTypeSlug)
        )
      : null;
    const defaultSignoff = signoffs.find(
      (s) => !Array.isArray(s.applies_to_post_types) || s.applies_to_post_types.length === 0
    );
    const selectedSignoff = matchedSignoff || defaultSignoff || signoffs[0] || null;

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

    // 5. If a postingSlotId was provided but no template fields, look up the slot
    let resolvedTemplate = templateInstructions;
    let resolvedPostTypeSlug = postTypeSlug;
    let resolvedPostTypeLabel = postTypeLabel;
    let resolvedWordMin = wordCountMin;
    let resolvedWordMax = wordCountMax;
    let resolvedArchetype = imageArchetype;
    let resolvedCtaUrl = ctaUrl;
    let resolvedCtaLinkText = ctaLinkText;
    let resolvedDayOfWeek = dayOfWeek;
    let resolvedTime = scheduledTime;
    let resolvedSlotLabel = slotLabel;

    if (postingSlotId && !resolvedTemplate) {
      const { data: slot } = await supabase
        .from("posting_slots")
        .select("*, post_types(*)")
        .eq("id", postingSlotId)
        .single();

      if (slot) {
        const pt = slot.post_types as { slug: string; label: string; template_instructions: string | null; word_count_min: number | null; word_count_max: number | null; default_image_archetype: string | null } | null;
        resolvedTemplate = pt?.template_instructions || undefined;
        resolvedPostTypeSlug = pt?.slug || undefined;
        resolvedPostTypeLabel = pt?.label || undefined;
        resolvedWordMin = pt?.word_count_min || undefined;
        resolvedWordMax = pt?.word_count_max || undefined;
        resolvedArchetype = slot.image_archetype || pt?.default_image_archetype || undefined;
        resolvedCtaUrl = slot.cta_url || undefined;
        resolvedCtaLinkText = slot.cta_link_text || undefined;
        resolvedDayOfWeek = slot.day_of_week;
        resolvedTime = slot.scheduled_time;
        resolvedSlotLabel = slot.slot_label || undefined;
      }
    }

    // 6. Call the provider
    const input: ContentGenerationInput = {
      blueprintContent: blueprintRes.data?.blueprint_content || "No blueprint configured.",
      topicTitle: topic?.title || slotLabel || "Content piece",
      topicDescription: topic?.description || additionalContext || null,
      pillar: topic?.pillar || null,
      audienceTheme: topic?.audience_theme || null,
      contentType: contentType as ContentGenerationInput["contentType"],
      weekNumber: weekRes.data.week_number,
      spokespersonName: spokespersonName || companyRes.data?.spokesperson_name || null,
      additionalContext,
      // Slot-specific fields
      postTypeSlug: resolvedPostTypeSlug,
      postTypeLabel: resolvedPostTypeLabel,
      templateInstructions: resolvedTemplate,
      wordCountMin: resolvedWordMin,
      wordCountMax: resolvedWordMax,
      imageArchetype: resolvedArchetype,
      ctaUrl: resolvedCtaUrl,
      ctaLinkText: resolvedCtaLinkText,
      dayOfWeek: resolvedDayOfWeek,
      scheduledTime: resolvedTime,
      slotLabel: resolvedSlotLabel,
      blogTitle: blogTitle || undefined,
      blogUrl: blogUrl || undefined,
      // Sign-off from company_signoffs — gives AI the exact text to use verbatim
      signoffText: selectedSignoff?.signoff_text || undefined,
      firstCommentTemplate: selectedSignoff?.first_comment_template || undefined,
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
        post_type: resolvedPostTypeSlug || output.postType,
        day_of_week: resolvedDayOfWeek !== undefined ? String(resolvedDayOfWeek) : null,
        scheduled_time: resolvedTime || null,
        pillar: topic?.pillar || null,
        audience_theme: topic?.audience_theme || null,
        topic_bank_ref: topic ? `#${topic.topic_number}: ${topic.title}` : (slotLabel || null),
        ecosystem_role: ecosystemRole || getEcosystemRole(resolvedPostTypeSlug || contentType),
        cta_tier_used: ctaTier || null,
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

    // 8. Mark topic as used (only if we have a valid topic)
    if (isValidTopicId) {
      await supabase
        .from("topic_bank")
        .update({ is_used: true, used_in_week_id: weekId })
        .eq("id", topicId);
    }

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

    // If it's a blog article, capture blog info for the week ecosystem
    let blogInfo = null;
    if (contentType === 'blog_article' && output.title) {
      const slugAsset = output.assets?.find((a) => a.assetType === "url_slug");
      blogInfo = {
        blogTitle: output.title,
        blogUrl: slugAsset ? slugAsset.textContent : null,
      };
    }

    // Collect blog/article image prompts from assets for multi-image generation
    const IMAGE_PROMPT_ASSET_TYPES = [
      "cover_image_prompt",
      "hero_image_prompt",
      "header_image_prompt",
      "in_article_image_prompt_1",
      "in_article_image_prompt_2",
      "in_article_image_prompt_3",
      "infographic_prompt",
    ];
    const blogImagePrompts = (output.assets || [])
      .filter((a) => IMAGE_PROMPT_ASSET_TYPES.includes(a.assetType))
      .map((a) => ({
        assetType: a.assetType,
        prompt: a.textContent,
      }));

    return NextResponse.json({
      jobId,
      status: "completed",
      pieceId: piece.id,
      contentPieceId: piece.id,
      title: output.title,
      imagePrompt: output.imagePrompt || null,
      blogImagePrompts: blogImagePrompts.length > 0 ? blogImagePrompts : null,
      blogInfo,
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
