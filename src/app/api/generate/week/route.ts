import { NextResponse } from "next/server";
import { requireAdmin, createAdminSupabaseClient } from "@/lib/supabase/admin";
import { getContentProvider, getImageProvider } from "@/lib/providers";
import { assignTopicsToSlots } from "@/lib/generation/topic-assigner";
import type { ContentGenerationInput } from "@/lib/providers";
import type { PostingSlotWithType, TopicBankEntry } from "@/types/database";

/**
 * POST /api/generate/week
 *
 * Orchestrates generation of an entire week's content following the content strategy.
 *
 * Body: {
 *   companyId: string,
 *   weekId: string,
 *   mode: "cohesive" | "variety",
 *   subject?: string,                // Required for cohesive mode
 *   assignments?: SlotAssignment[],  // Optional override (manual mode)
 *   generateImages?: boolean,        // Default true
 * }
 *
 * Flow:
 * 1. Fetch posting slots for the company
 * 2. If no manual assignments: auto-assign topics using the algorithm
 * 3. For each assignment:
 *    a. Generate content (calls provider directly, not via /api/generate/content)
 *    b. If generateImages: extract image_prompt, generate image
 * 4. Return summary of what was created
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
    mode = "variety",
    subject,
    generateImages = true,
  } = body;

  if (!companyId || !weekId) {
    return NextResponse.json(
      { error: "companyId and weekId are required" },
      { status: 400 }
    );
  }

  if (mode === "cohesive" && !subject) {
    return NextResponse.json(
      { error: "subject is required for cohesive mode" },
      { status: 400 }
    );
  }

  const supabase = await createAdminSupabaseClient();

  // ── 1. Fetch company, week, blueprint, slots, topics, setup data ───────
  const [companyRes, weekRes, blueprintRes, slotsRes, topicsRes, signoffRes, voiceRes] = await Promise.all([
    supabase.from("companies").select("*").eq("id", companyId).single(),
    supabase.from("weeks").select("*").eq("id", weekId).single(),
    supabase
      .from("company_blueprints")
      .select("blueprint_content, derived_source_context")
      .eq("company_id", companyId)
      .eq("is_active", true)
      .single(),
    supabase
      .from("posting_slots")
      .select("*, post_types(*)")
      .eq("company_id", companyId)
      .eq("is_active", true)
      .order("sort_order"),
    supabase
      .from("topic_bank")
      .select("*")
      .eq("company_id", companyId)
      .eq("is_used", false)
      .order("topic_number"),
    supabase
      .from("company_signoffs")
      .select("*")
      .eq("company_id", companyId)
      .eq("is_active", true)
      .order("sort_order")
      .limit(1)
      .single(),
    supabase
      .from("company_voice_profiles")
      .select("*")
      .eq("company_id", companyId)
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .single(),
  ]);

  if (!companyRes.data) {
    return NextResponse.json({ error: "Company not found" }, { status: 404 });
  }
  if (!weekRes.data) {
    return NextResponse.json({ error: "Week not found" }, { status: 404 });
  }

  const company = companyRes.data;
  const week = weekRes.data;
  const blueprintContent = blueprintRes.data?.blueprint_content || "";
  const sourceContext = blueprintRes.data?.derived_source_context || "";
  const slots = (slotsRes.data || []) as PostingSlotWithType[];
  const unusedTopics = (topicsRes.data || []) as TopicBankEntry[];

  // Setup data (may be null if not configured yet — that is OK)
  const signoff = signoffRes.data;
  const voiceProfile = voiceRes.data;

  if (slots.length === 0) {
    return NextResponse.json(
      { error: "No posting slots configured. Set up a posting schedule in Setup first." },
      { status: 400 }
    );
  }

  // ── 2. Auto-assign topics to slots ─────────────────────────
  const { assignments, unassignedSlots } = assignTopicsToSlots({
    slots,
    unusedTopics,
    mode: mode as "cohesive" | "variety",
    weekSubject: subject,
    weekPillar: week.pillar,
    weekTheme: week.theme,
  });

  if (assignments.length === 0) {
    return NextResponse.json(
      { error: "Could not assign any topics. Check your topic bank has unused topics." },
      { status: 400 }
    );
  }

  // Update week subject if cohesive mode
  if (mode === "cohesive" && subject) {
    await supabase.from("weeks").update({ subject }).eq("id", weekId);
  }

  // ── 3. Resolve providers ───────────────────────────────────
  let contentProvider;
  let imageProvider;

  try {
    const cp = await getContentProvider(companyId);
    contentProvider = cp.provider;
  } catch (err) {
    return NextResponse.json(
      { error: `Content provider error: ${err instanceof Error ? err.message : "Unknown"}` },
      { status: 500 }
    );
  }

  if (generateImages) {
    try {
      const ip = await getImageProvider(companyId);
      imageProvider = ip.provider;
    } catch {
      // Image generation is optional — continue without it
      imageProvider = null;
    }
  }

  // ── 4. Sort assignments: anchor content (blog, article) FIRST, then social ──
  // This way social posts can reference the blog URL
  const anchorTypes = new Set(["blog_article", "linkedin_article", "pdf_guide", "video_script"]);
  const anchorAssignments = assignments.filter((a) => anchorTypes.has(a.postTypeSlug));
  const socialAssignments = assignments.filter((a) => !anchorTypes.has(a.postTypeSlug));
  const orderedAssignments = [...anchorAssignments, ...socialAssignments];

  // Track blog output so social posts can reference it
  let blogTitle: string | null = null;
  let blogUrl: string | null = null;

  // ── 5. Generate content for each slot ──────────────────────
  const results: {
    slotLabel: string;
    pieceId: string | null;
    title: string;
    imageGenerated: boolean;
    error: string | null;
  }[] = [];

  let piecesCreated = 0;
  let imagesCreated = 0;

  for (const assignment of orderedAssignments) {
    try {
      // Build the generation input with full context
      const input: ContentGenerationInput = {
        blueprintContent,
        sourceContext,
        topicTitle: assignment.topicTitle,
        topicDescription: assignment.topicDescription,
        pillar: assignment.topicPillar,
        audienceTheme: assignment.topicAudienceTheme,
        contentType: (assignment.postTypeSlug === "blog_article" || assignment.postTypeSlug === "linkedin_article")
          ? assignment.postTypeSlug as ContentGenerationInput["contentType"]
          : "social_post",
        weekNumber: week.week_number,
        spokespersonName: company.spokesperson_name,
        postTypeSlug: assignment.postTypeSlug,
        postTypeLabel: assignment.postTypeLabel,
        templateInstructions: assignment.templateInstructions || undefined,
        wordCountMin: assignment.wordCountMin || undefined,
        wordCountMax: assignment.wordCountMax || undefined,
        imageArchetype: assignment.imageArchetype || undefined,
        ctaUrl: assignment.ctaUrl || undefined,
        ctaLinkText: assignment.ctaLinkText || undefined,
        // Inject sign-off and first comment template from setup
        signoffText: signoff?.signoff_text || undefined,
        firstCommentTemplate: signoff?.first_comment_template || undefined,
        // Inject voice profile
        voiceDescription: voiceProfile?.voice_description || undefined,
        bannedVocabulary: voiceProfile?.banned_vocabulary || undefined,
        signatureDevices: voiceProfile?.signature_devices || undefined,
        // Weekly ecosystem: social posts reference the blog
        blogTitle: blogTitle || undefined,
        blogUrl: blogUrl || undefined,
        dayOfWeek: assignment.dayOfWeek,
        scheduledTime: assignment.scheduledTime,
        slotLabel: assignment.slotLabel,
        additionalContext: assignment.angle
          ? `WEEK SUBJECT: ${subject}\nANGLE FOR THIS POST: ${assignment.angle}`
          : undefined,
      };

      // Generate content
      const output = await contentProvider.generate(input);

      // Create the content piece
      const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
      const { data: piece } = await supabase
        .from("content_pieces")
        .insert({
          week_id: weekId,
          company_id: companyId,
          content_type: input.contentType,
          title: output.title,
          markdown_body: output.markdownBody,
          first_comment: output.firstComment,
          pillar: assignment.topicPillar,
          audience_theme: assignment.topicAudienceTheme,
          topic_bank_ref: assignment.topicId ? `TB#${assignment.topicTitle}` : null,
          word_count: output.wordCount,
          post_type: assignment.postTypeSlug,
          day_of_week: DAY_NAMES[assignment.dayOfWeek] || null,
          scheduled_time: assignment.scheduledTime,
          sort_order: orderedAssignments.indexOf(assignment),
          approval_status: "pending",
          image_generation_status: generateImages && output.imagePrompt ? "pending" : "skipped",
        })
        .select()
        .single();

      if (!piece) throw new Error("Failed to create content piece");

      // Capture blog output so social posts can reference it
      if (assignment.postTypeSlug === "blog_article" && output.title) {
        blogTitle = output.title;
        // Build blog URL from slug asset or fallback
        const slugAsset = output.assets?.find((a) => a.assetType === "url_slug");
        blogUrl = slugAsset
          ? `https://www.agencybristol.com/blog/${slugAsset.textContent}`
          : `https://www.agencybristol.com/blog`;
      }

      // Store assets (image prompt, etc.)
      if (output.assets && output.assets.length > 0) {
        await supabase.from("content_assets").insert(
          output.assets.map((a, i) => ({
            content_piece_id: piece.id,
            asset_type: a.assetType,
            text_content: a.textContent,
            asset_metadata: {},
            sort_order: i,
          }))
        );
      }

      // Store image prompt as asset if not already in output.assets
      if (output.imagePrompt) {
        const hasImagePrompt = output.assets?.some((a) => a.assetType === "image_prompt");
        if (!hasImagePrompt) {
          await supabase.from("content_assets").insert({
            content_piece_id: piece.id,
            asset_type: "image_prompt",
            text_content: output.imagePrompt,
            asset_metadata: {},
            sort_order: 99,
          });
        }
      }

      // Mark topic as used (variety mode only)
      if (assignment.topicId) {
        await supabase
          .from("topic_bank")
          .update({ is_used: true, used_in_week_id: weekId })
          .eq("id", assignment.topicId);
      }

      piecesCreated++;

      // ── Generate image if enabled ──────────────────────────
      let imageGenerated = false;

      if (generateImages && imageProvider && output.imagePrompt) {
        try {
          await supabase
            .from("content_pieces")
            .update({ image_generation_status: "generating" })
            .eq("id", piece.id);

          const imgResult = await imageProvider.generate({
            prompt: output.imagePrompt,
            style: assignment.imageArchetype || undefined,
            aspectRatio: "1:1",
            count: 1,
          });

          if (imgResult.images.length > 0) {
            await supabase.from("content_images").insert(
              imgResult.images.map((img, i) => ({
                content_piece_id: piece.id,
                filename: img.filename,
                storage_path: "",
                public_url: img.url,
                archetype: assignment.imageArchetype || null,
                sort_order: i,
              }))
            );
            imageGenerated = true;
            imagesCreated += imgResult.images.length;
          }

          await supabase
            .from("content_pieces")
            .update({ image_generation_status: imageGenerated ? "completed" : "failed" })
            .eq("id", piece.id);
        } catch (imgErr) {
          console.error(`Image generation failed for ${piece.title}:`, imgErr);
          await supabase
            .from("content_pieces")
            .update({ image_generation_status: "failed" })
            .eq("id", piece.id);
        }
      }

      results.push({
        slotLabel: assignment.slotLabel,
        pieceId: piece.id,
        title: output.title,
        imageGenerated,
        error: null,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`Generation failed for slot ${assignment.slotLabel}:`, message);
      results.push({
        slotLabel: assignment.slotLabel,
        pieceId: null,
        title: assignment.topicTitle,
        imageGenerated: false,
        error: message,
      });
    }
  }

  return NextResponse.json({
    success: true,
    mode,
    subject: mode === "cohesive" ? subject : null,
    piecesCreated,
    imagesCreated,
    totalSlots: assignments.length,
    unassignedSlots: unassignedSlots.length,
    results,
  });
}
