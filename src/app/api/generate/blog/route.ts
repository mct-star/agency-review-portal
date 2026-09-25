import { NextResponse } from "next/server";
import { requireAdmin, createAdminSupabaseClient } from "@/lib/supabase/admin";
import { getContentProvider, resolveProvider } from "@/lib/providers";
import type { ContentGenerationInput } from "@/lib/providers";
import { generateWithValidation } from "@/lib/generation/validated-generator";
import { buildPreGenerationContext, runPostGenerationGates, type GateResult } from "@/lib/generation/content-intelligence";
import { buildVoicePrompt } from "@/lib/voice-to-prompt";
import { assetRowsFor, saveAssets } from "@/lib/content/save-assets";
import { BLOG_WORD_MIN, parseBlogRequest, threeLayerBrief } from "@/lib/content/blog-request";

export const maxDuration = 300;

/**
 * POST /api/generate/blog
 *
 * One blog article through the full content method (25 Sept 2026), the
 * same way the weekly run writes its anchor piece: the company blueprint,
 * voice profile and source context; the blog_article template and word
 * counts from post_types; the three layers; stories from the story bank;
 * generation with the fix loop (validated-generator) and then the content
 * intelligence gates. The Blog / Article page used to send a topic to
 * quick generate, which dropped the company and word count and wrote a
 * social post with no pillar or theme.
 *
 * Body: { companyId, topicId?, topicTitle, pillar, audienceTheme,
 *         brandPillar, wordCountMax, additionalContext? }
 * The piece goes into the company's standalone week (week_number 0).
 */
export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = parseBlogRequest(await request.json().catch(() => ({})));
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const req = parsed.value;
  const supabase = await createAdminSupabaseClient();

  const [companyRes, blueprintRes, typeRes, voiceRes, storiesRes, topicRes, weekRes] = await Promise.all([
    supabase.from("companies").select("*").eq("id", req.companyId).single(),
    supabase.from("company_blueprints").select("blueprint_content, derived_source_context")
      .eq("company_id", req.companyId).eq("is_active", true).maybeSingle(),
    supabase.from("post_types").select("slug, label, template_instructions, word_count_min").eq("slug", "blog_article").maybeSingle(),
    supabase.from("company_voice_profiles").select("*").eq("company_id", req.companyId).eq("is_active", true)
      .order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("story_bank").select("id, title, story_text, pillar, tags").eq("company_id", req.companyId)
      .order("used_count", { ascending: true }),
    req.topicId
      ? supabase.from("topic_bank").select("*").eq("id", req.topicId).eq("company_id", req.companyId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    supabase.from("weeks").select("id, week_number").eq("company_id", req.companyId).eq("week_number", 0)
      .order("created_at").limit(1).maybeSingle(),
  ]);

  const company = companyRes.data;
  if (!company) return NextResponse.json({ error: "Company not found" }, { status: 404 });
  if (!blueprintRes.data?.blueprint_content) {
    return NextResponse.json({ error: "This company has no active blueprint, so there is no voice to write in. Set one up first." }, { status: 400 });
  }
  if (req.topicId && !topicRes.data) return NextResponse.json({ error: "Topic not found for this company" }, { status: 404 });

  // The standalone container single pieces live in (as generate/page.tsx makes it).
  let weekId = weekRes.data?.id as string | undefined;
  if (!weekId) {
    const today = new Date().toISOString().slice(0, 10);
    const { data: week, error } = await supabase.from("weeks").insert({
      company_id: req.companyId, week_number: 0, year: new Date().getFullYear(),
      date_start: today, date_end: today, title: "Standalone content", status: "draft",
    }).select("id").single();
    if (error || !week) return NextResponse.json({ error: `Could not create the standalone week: ${error?.message}` }, { status: 500 });
    weekId = week.id as string;
  }

  let provider, fixProvider;
  try {
    provider = (await getContentProvider(req.companyId)).provider;
    const resolved = await resolveProvider(req.companyId, "content_generation");
    if (resolved) {
      const { createClaudeFixProvider } = await import("@/lib/providers/content-generation/anthropic");
      fixProvider = createClaudeFixProvider(resolved.credentials, resolved.settings);
    }
  } catch (err) {
    return NextResponse.json({ error: `Content provider error: ${err instanceof Error ? err.message : "unknown"}` }, { status: 500 });
  }

  const voiceProfile = voiceRes.data;
  const topic = topicRes.data as { id: string; topic_number: number; title: string; description: string | null } | null;
  const stories = ((storiesRes.data || []) as Array<{ title: string; story_text: string; pillar: string | null; tags: string[] | null }>)
    .filter(s => s.pillar === req.pillar || (s.tags || []).some(t => req.topicTitle.toLowerCase().includes(t.toLowerCase())))
    .slice(0, 3);

  const context = [
    threeLayerBrief(req),
    stories.length > 0
      ? ["PROOF POINTS / STORIES TO WEAVE IN (use at least one as the case study):",
          ...stories.map(s => `- ${s.title}: ${s.story_text.slice(0, 400)}${s.story_text.length > 400 ? "..." : ""}`)].join("\n")
      : null,
    req.additionalContext ? `FROM MICHAEL:\n${req.additionalContext}` : null,
  ].filter(Boolean).join("\n\n");

  const input: ContentGenerationInput = {
    blueprintContent: blueprintRes.data.blueprint_content,
    sourceContext: blueprintRes.data.derived_source_context || undefined,
    topicTitle: topic?.title || req.topicTitle,
    topicDescription: topic?.description ?? null,
    pillar: req.pillar,
    audienceTheme: req.audienceTheme,
    contentType: "blog_article",
    weekNumber: 0,
    spokespersonName: company.spokesperson_name,
    postTypeSlug: "blog_article",
    postTypeLabel: typeRes.data?.label || "Blog Article",
    templateInstructions: typeRes.data?.template_instructions || undefined,
    wordCountMin: Math.max(BLOG_WORD_MIN, typeRes.data?.word_count_min || 0),
    wordCountMax: req.wordCountMax,
    imageArchetype: "editorial_photography",
    // No sign-off: "Repost it to your network" closes a LinkedIn post, not a blog.
    voicePrompt: buildVoicePrompt(voiceProfile) || undefined,
    voiceDescription: !voiceProfile?.structured_voice ? (voiceProfile?.voice_description || undefined) : undefined,
    bannedVocabulary: !voiceProfile?.structured_voice ? (voiceProfile?.banned_vocabulary || undefined) : undefined,
    signatureDevices: !voiceProfile?.structured_voice ? (voiceProfile?.signature_devices || undefined) : undefined,
    companyIndustry: company.industry || undefined,
    companyDescription: company.description || undefined,
    preGenerationContext: buildPreGenerationContext({ postTypeSlug: "blog_article", weekNumber: 0, isHealthcareCompany: true, voiceProfile: voiceProfile || null }),
    additionalContext: context,
  };

  let generated;
  try {
    generated = await generateWithValidation(provider, input, fixProvider || undefined);
  } catch (err) {
    return NextResponse.json({ error: `Generation failed: ${err instanceof Error ? err.message : "unknown"}` }, { status: 502 });
  }
  const { output, validation, iterations, fixHistory } = generated;

  let gates: GateResult[] = [];
  try {
    gates = await runPostGenerationGates({
      postTypeSlug: "blog_article",
      content: output.markdownBody || "",
      // The opening line of the article, not a subheading.
      hookLine: (output.markdownBody || "").split("\n").map(l => l.trim()).find(l => l && !l.startsWith("#")) || "",
      companyId: req.companyId,
      weekNumber: 0,
      isHealthcareCompany: true,
      contentType: "blog_article",
      firstComment: output.firstComment,
      title: output.title || "",
      wordCountMin: input.wordCountMin,
      wordCountMax: input.wordCountMax,
    });
  } catch (err) {
    console.warn("[generate/blog] gates failed to run:", err);
  }

  const { data: last } = await supabase.from("content_pieces").select("sort_order").eq("week_id", weekId)
    .order("sort_order", { ascending: false }).limit(1);
  const { data: piece, error: pieceErr } = await supabase.from("content_pieces").insert({
    week_id: weekId,
    company_id: req.companyId,
    content_type: "blog_article",
    title: output.title,
    markdown_body: output.markdownBody,
    first_comment: null,
    word_count: output.wordCount,
    post_type: "blog_article",
    pillar: req.pillar,
    audience_theme: req.audienceTheme,
    topic_bank_ref: topic ? `#${topic.topic_number}: ${topic.title}` : null,
    ecosystem_role: "anchor",
    sort_order: (last?.[0]?.sort_order ?? -1) + 1,
    approval_status: "pending",
    image_generation_status: "skipped",
  }).select("id").single();
  if (pieceErr || !piece) return NextResponse.json({ error: `Could not save the article: ${pieceErr?.message}` }, { status: 500 });

  const assetError = await saveAssets(supabase, assetRowsFor(piece.id, output.assets, output.imagePrompt));
  if (assetError) console.error(`[generate/blog] assets not saved for ${piece.id}: ${assetError}`);
  if (topic) await supabase.from("topic_bank").update({ is_used: true, used_in_week_id: weekId }).eq("id", topic.id);

  return NextResponse.json({
    pieceId: piece.id,
    title: output.title,
    wordCount: output.wordCount,
    qualityPassed: validation.allPassed,
    qualityIterations: iterations,
    qualityFailures: validation.allPassed ? [] : (fixHistory.at(-1)?.failures ?? []),
    gates,
    assetError,
  });
}
