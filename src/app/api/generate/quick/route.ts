import { NextResponse } from "next/server";
import { requireCompanyUser, createAdminSupabaseClient } from "@/lib/supabase/admin";
import { getContentProvider, getImageProvider, resolveProvider } from "@/lib/providers";
import { enhanceImagePrompt } from "@/lib/providers/image-generation/prompt-enhancer";
import { routeImageStyle, getEffectiveProvider } from "@/lib/providers/image-routing";
import { buildVoicePrompt } from "@/lib/voice-to-prompt";
import {
  buildPreGenerationContext,
  runPostGenerationGates,
  buildGateFixInstructions,
  hasCriticalFailures,
  type GateResult,
} from "@/lib/generation/content-intelligence";
import { generateQuoteCard, QUOTE_CARD_COLORS } from "@/lib/image/quote-card";
import { generateCarousel, type CarouselSlide } from "@/lib/image/carousel";
import { generateSceneQuote, getScenePrompt } from "@/lib/image/scene-quote";
import { getEffectivePlan } from "@/lib/utils/get-effective-plan";
import { checkPostLimit, isVisualStyleAllowed, isFaceMatchAllowed } from "@/lib/utils/plan-limits";
import type { PlanTier } from "@/types/database";

/**
 * POST /api/generate/quick
 *
 * Quick Generate — creates a single post (text + image) in one call.
 * No week/calendar required. Used by the dashboard Quick Generate widget.
 *
 * Body: {
 *   companyId: string,
 *   topic: string,           // Free-text topic
 *   postTypeSlug: string,    // e.g. "insight", "if_i_was", "founder_friday"
 *   platform: string,        // "linkedin" | "x" | "instagram"
 * }
 *
 * Returns: {
 *   postText: string,
 *   firstComment: string | null,
 *   imageUrl: string | null,
 *   imagePrompt: string | null,
 * }
 */

// Post type → archetype + image style mapping (from the atoms)
// Pixar archetypes use a dynamic character description from the company's
// spokesperson_appearance field, so the Pixar character resembles the real person.
const DEFAULT_APPEARANCE = "professional in smart business attire";

interface PostTypeConfig {
  archetype: string;
  imageStyle: string | ((appearance: string) => string);
  dimensions: { width: number; height: number };
  wordCountMin?: number;
  wordCountMax?: number;
  /** Post-type-specific content instructions. Overrides the generic social_post format. */
  contentInstructions?: string;
}

// Image style slug → prompt template map. Used when a company overrides
// the default archetype for a post type via image-mapping setup.
// Functions receive (appearance: string) for styles that depict a person.
const STYLE_PROMPTS: Record<string, string | ((appearance: string) => string)> = {
  pixar_3d: (appearance) =>
    `Pixar/Disney-adjacent 3D rendered scene. Sophisticated lighting, slightly exaggerated proportions. Main character: ${appearance}. The Pixar character should clearly resemble this person. Detailed environment with depth.`,
  editorial_photography: "Photorealistic editorial photograph in a professional business or healthcare setting. Documentary quality, authentic lighting. Clean composition, no people. Shot on 35mm, shallow depth of field.",
  lifestyle_photography: "Warm lifestyle photography with soft natural lighting. Product-in-context, authentic moment. Shallow depth of field, muted tones, editorial quality.",
  quote_card: "PROGRAMMATIC", // Handled by quote card generator, not AI
  carousel_framework: "Clean white background with purple (#A27BF9) accents. Typography-led framework slide. Oversized accent number + heading + body text. Generous whitespace. Line-art icon. Professional, airy layout.",
  infographic: "Clean infographic with structured data visualisation. Modern flat design, clear hierarchy. Brand accent colours. White background, minimal decoration. Statistics and data points clearly presented.",
  editorial_photo: "Candid editorial photography. Natural light, warm golden tones. Lifestyle scene — walking outdoors, coffee shop, workspace, nature, city streets. Authentic and unposed, real-life moment. Shot on 35mm film aesthetic. Shallow depth of field. Warm, human, relatable. No text on image. No people's faces unless specifically described.",
  real_photo: "SKIP", // User-uploaded photos, no generation
  flat_illustration: "Modern flat vector illustration with clean lines and bold shapes. Minimal detail, geometric forms. Professional and approachable. Limited colour palette with one accent colour. Concept-level abstraction.",
};

const POST_TYPE_CONFIG: Record<string, PostTypeConfig> = {
  insight: {
    archetype: "quote_card",
    imageStyle: "Flat solid green (#CDD856) background, edge to edge. Bold italic white text centred in middle third. Max 12 words. No scenes, people, objects, gradients, textures. The power comes from the emptiness.",
    dimensions: { width: 1080, height: 1080 },
    wordCountMin: 150, wordCountMax: 250,
    contentInstructions: `POST TYPE: Problem Diagnosis. Identify a common mistake, blind spot, or misconception in the audience's industry. Structure: punchy hook (the mistake) → why it happens (2 paras) → what they should do instead (1-2 paras) → reflective question. Tone: direct but empathetic. You have seen this mistake before.`,
  },
  launch_story: {
    archetype: "pixar_healthcare",
    imageStyle: (appearance) =>
      `Pixar/Disney-adjacent 3D rendered scene in a professional business environment. Sophisticated lighting, slightly exaggerated proportions. Main character: ${appearance}. The Pixar character should clearly resemble this person.`,
    dimensions: { width: 1080, height: 1350 },
    wordCountMin: 200, wordCountMax: 350,
    contentInstructions: `POST TYPE: Experience Story. Share a real or realistic experience that reveals a pattern. Structure: hook (the moment) → set the scene (what happened) → the pattern you noticed → what it taught you → takeaway for the reader. Tone: narrative, observational, first-person.`,
  },
  if_i_was: {
    archetype: "quote_card",
    imageStyle: "Flat solid purple (#A27BF9) background, edge to edge. Bold italic white text centred in middle third. Max 12 words. Hand-drawn black arrow curving downward beneath the text. No scenes, people, objects, gradients, textures.",
    dimensions: { width: 1080, height: 1080 },
    wordCountMin: 200, wordCountMax: 300,
    contentInstructions: `POST TYPE: Expert Perspective. "If I was in your role..." practical, specific advice. Structure: hook (the situation) → "If I was in your role, here is what I would do" → 3-4 specific, actionable steps → why this works → open question. Tone: authoritative but generous. Sharing expertise freely.`,
  },
  contrarian: {
    archetype: "quote_card",
    imageStyle: "Flat solid blue (#41C9FE) background, edge to edge. Bold italic white text centred in middle third. Max 12 words. Accusation, revelation, or confrontation tone. No scenes, people, objects, gradients, textures.",
    dimensions: { width: 1080, height: 1080 },
    wordCountMin: 200, wordCountMax: 300,
    contentInstructions: `POST TYPE: Contrarian Take. Challenge a widely-held industry assumption. Structure: hook (the assumption everyone believes) → why it is wrong or incomplete → evidence from your experience → what to do instead → provocative closing question. Tone: confident, slightly provocative but not arrogant. Back it up with specifics.`,
  },
  tactical: {
    archetype: "carousel",
    imageStyle: "Clean white background with purple (#A27BF9) accents. Typography-led framework slide. Oversized purple number + heading + body text. Generous whitespace. Line-art icon. Professional, airy layout.",
    dimensions: { width: 1080, height: 1080 },
    wordCountMin: 150, wordCountMax: 250,
    contentInstructions: `POST TYPE: Tactical How-To. Actionable steps to solve a specific problem. Structure: hook (the problem) → numbered steps (3-5, each with a heading and 1-2 sentence explanation) → brief closing. IMPORTANT: Use numbered points (1. 2. 3.) because the image generator will parse these into carousel slides. Tone: practical, no fluff, each step must be immediately actionable.`,
  },
  founder_friday: {
    archetype: "pixar_fantasy",
    imageStyle: (appearance) =>
      `Pixar/Disney-adjacent 3D rendered scene showing a 'fantasy vs reality' moment. Split composition or contrasting elements. Main character: ${appearance}. The Pixar character should clearly resemble this person. Warm, intimate lighting. Candid, reflective moment.`,
    dimensions: { width: 1080, height: 1350 },
    wordCountMin: 250, wordCountMax: 400,
    contentInstructions: `POST TYPE: Personal Reflection. Behind the scenes — expectations vs reality. Structure: hook (the expectation) → what actually happened → the gap between expectation and reality → what you learned → reflective closing. Tone: honest, vulnerable, self-aware. This is the most personal post type. Show the human behind the professional.`,
  },
  blog_teaser: {
    archetype: "quote_card",
    imageStyle: "Flat solid emerald (#059669) background, edge to edge. Bold white text centred. Article title as hook. Clean, minimal.",
    dimensions: { width: 1080, height: 1080 },
    wordCountMin: 60, wordCountMax: 120,
    contentInstructions: `POST TYPE: Article Teaser. SHORT. Drive traffic to a longer piece of content. Structure: hook (the insight) → 1-2 sentences teasing the full article → call to read more. This is NOT a full post. It is a teaser. Maximum 120 words. Make the reader curious enough to click through.`,
  },
  personal_update: {
    archetype: "editorial_photo",
    imageStyle: "Candid editorial photography. Natural light, warm tones. Lifestyle scene matching the topic — walking, coffee shop, workspace, travel, family, nature. Authentic and unposed. Shot on 35mm film look. Shallow depth of field. No text on the image.",
    dimensions: { width: 1080, height: 1080 },
    wordCountMin: 100, wordCountMax: 200,
    contentInstructions: `POST TYPE: Personal Update. Share what you are up to — candid, human, relatable. Structure: hook (what you were doing) → the moment or observation → a brief business insight that connects it back to work → warm closing. Tone: casual, warm, conversational. This reads like a friend talking, not a professional posting. Short paragraphs, natural language.`,
  },
  scene_provocation: {
    archetype: "scene_quote",
    imageStyle: "Industry-relevant scene with a blank surface for text overlay. Whiteboard, billboard, chalkboard, or screen in a professional setting.",
    dimensions: { width: 1080, height: 1080 },
    wordCountMin: 150, wordCountMax: 250,
    contentInstructions: `POST TYPE: Scene Provocation. A bold, provocative statement that challenges the status quo. Structure: hook (the bold claim) → why this matters → evidence or experience backing it up → what should change → call to debate. Tone: confident, slightly confrontational. The hook should be something you would write on a whiteboard in a meeting to make people stop and think.`,
  },
};

export async function POST(request: Request) {
  const body = await request.json();
  const { companyId, spokespersonId, topic, postTypeSlug, platform } = body;

  if (!companyId || !topic || !postTypeSlug) {
    return NextResponse.json(
      { error: "companyId, topic, and postTypeSlug are required" },
      { status: 400 }
    );
  }

  // Allow admin OR the company's own users to generate
  const user = await requireCompanyUser(companyId);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = await createAdminSupabaseClient();
  const typeConfig = POST_TYPE_CONFIG[postTypeSlug] || POST_TYPE_CONFIG.insight;

  try {
    // ── 1. Fetch company context + spokesperson ─────────────────
    const { data: company, error: companyError } = await supabase
      .from("companies")
      .select("name, description, industry, spokesperson_name, brand_color, brand_palette, spokesperson_appearance, preferred_image_styles, post_type_image_mapping, provider_routing, plan, trial_plan, trial_expires_at")
      .eq("id", companyId)
      .single();

    // ── Plan enforcement ──────────────────────────────────────
    if (!company) {
      console.error(`[quick] Company not found for id=${companyId}`, companyError);
      return NextResponse.json({ error: `Company not found (id: ${companyId})` }, { status: 404 });
    }

    const effectivePlan = getEffectivePlan(company as { plan: PlanTier; trial_plan?: PlanTier | null; trial_expires_at?: string | null });
    const postCheck = await checkPostLimit(supabase, companyId, effectivePlan);
    if (!postCheck.allowed) {
      return NextResponse.json(
        {
          error: `Monthly post limit reached (${postCheck.used}/${postCheck.limit}). Upgrade to Pro for unlimited content generation.`,
          limitReached: true,
          used: postCheck.used,
          limit: postCheck.limit,
        },
        { status: 429 }
      );
    }

    // Resolve effective image style for this post type.
    // Priority: per-post-type mapping > preferred styles > hardcoded default
    const imageMapping = (company?.post_type_image_mapping as Record<string, { imageStyle: string; color?: string; characterDescription?: string }>) || {};
    const postTypeOverride = imageMapping[postTypeSlug];
    const preferredStyles = (company?.preferred_image_styles as string[]) || [];

    const { data: blueprint } = await supabase
      .from("company_blueprints")
      .select("blueprint_text")
      .eq("company_id", companyId)
      .eq("is_active", true)
      .single();

    // If a specific spokesperson was selected, use their details instead of company defaults
    let activeSpokesPerson: { name: string; tagline: string | null; appearance: string | null } | null = null;
    if (spokespersonId) {
      const { data: person } = await supabase
        .from("company_spokespersons")
        .select("name, tagline, profile_picture_url, appearance_description")
        .eq("id", spokespersonId)
        .eq("company_id", companyId)
        .single();
      if (person) {
        activeSpokesPerson = {
          name: person.name,
          tagline: person.tagline,
          appearance: person.appearance_description || null,
        };
      }
    }

    // ── Fetch voice profile for this spokesperson (or company default) ──
    const voiceQuery = spokespersonId
      ? supabase.from("company_voice_profiles").select("*").eq("company_id", companyId).eq("spokesperson_id", spokespersonId).eq("is_active", true).order("created_at", { ascending: false }).limit(1).single()
      : supabase.from("company_voice_profiles").select("*").eq("company_id", companyId).is("spokesperson_id", null).eq("is_active", true).order("created_at", { ascending: false }).limit(1).single();
    const { data: voiceProfile } = await voiceQuery;
    const voicePromptText = buildVoicePrompt(voiceProfile);

    // Blog teasers use CTA URLs instead of sign-offs, and have no first comment.
    // Other post types use the standard signoff + first comment flow.
    const isBlogTeaser = postTypeSlug === "blog_teaser";

    // Fetch the matching signoff for this post type (skip for blog teasers)
    let selectedSignoff: { signoff_text?: string; first_comment_template?: string } | null = null;
    if (!isBlogTeaser) {
      const { data: signoffs } = await supabase
        .from("company_signoffs")
        .select("*")
        .eq("company_id", companyId)
        .eq("is_active", true)
        .order("sort_order");

      const matchedSignoff = signoffs?.find(
        (s: Record<string, unknown>) =>
          Array.isArray(s.applies_to_post_types) &&
          (s.applies_to_post_types as string[]).length > 0 &&
          (s.applies_to_post_types as string[]).includes(postTypeSlug)
      );
      const defaultSignoff = signoffs?.find(
        (s: Record<string, unknown>) => !Array.isArray(s.applies_to_post_types) || (s.applies_to_post_types as string[]).length === 0
      );
      selectedSignoff = matchedSignoff || defaultSignoff || signoffs?.[0] || null;
    }

    // For blog teasers, fetch CTA URLs to include in the post
    let ctaUrlContext = "";
    if (isBlogTeaser) {
      const { data: ctaUrls } = await supabase
        .from("company_cta_urls")
        .select("label, url")
        .eq("company_id", companyId)
        .eq("is_active", true)
        .order("sort_order");

      if (ctaUrls && ctaUrls.length > 0) {
        ctaUrlContext = `\n\nCTA URLs AVAILABLE (include the most relevant one in the post body as a call-to-action):\n${ctaUrls.map((u: { label: string; url: string }) => `- ${u.label}: ${u.url}`).join("\n")}`;
      }
    }

    // ── 2. Generate content ───────────────────────────────────────
    const { provider: contentProvider } = await getContentProvider(companyId);

    // Build Content Intelligence pre-generation context
    const preGenContext = buildPreGenerationContext({
      postTypeSlug,
      weekNumber: 0,
      isHealthcareCompany: ["healthcare", "pharma"].includes((company as Record<string, unknown>)?.industry as string || ""),
      voiceProfile: voiceProfile || null,
    });

    const blogTeaserContext = isBlogTeaser
      ? `This is a Blog Teaser post. RULES:
- Do NOT include a sign-off ("Enjoy this? Repost..." etc). Blog teasers end with a CTA link, not a sign-off.
- Do NOT generate a first comment. Set firstComment to null.
- Include one relevant CTA URL in the post body (not in a first comment).
- The post should make the reader want to click through to learn more.
- Keep it short and punchy: 60-120 words.${ctaUrlContext}`
      : "";

    const generateInput = {
      blueprintContent: blueprint?.blueprint_text || "",
      topicTitle: topic,
      topicDescription: null,
      pillar: null,
      audienceTheme: null,
      contentType: "social_post" as const,
      weekNumber: 0,
      spokespersonName: activeSpokesPerson?.name || company?.spokesperson_name || null,
      postTypeSlug,
      postTypeLabel: POST_TYPES_LABELS[postTypeSlug] || postTypeSlug,
      imageArchetype: typeConfig.archetype,
      wordCountMin: typeConfig.wordCountMin,
      wordCountMax: typeConfig.wordCountMax,
      signoffText: isBlogTeaser ? undefined : (selectedSignoff?.signoff_text || undefined),
      firstCommentTemplate: isBlogTeaser ? undefined : (selectedSignoff?.first_comment_template || undefined),
      // Inject full voice profile (structured or legacy)
      voicePrompt: voicePromptText || undefined,
      voiceDescription: !voicePromptText ? (voiceProfile?.voice_description || undefined) : undefined,
      bannedVocabulary: !voicePromptText ? (voiceProfile?.banned_vocabulary || undefined) : undefined,
      signatureDevices: !voicePromptText ? (voiceProfile?.signature_devices || undefined) : undefined,
      additionalContext: `Platform: ${platform || "linkedin"}. This is a standalone quick-generated post, not part of a weekly ecosystem.${blogTeaserContext ? `\n\n${blogTeaserContext}` : ""}`,
      // Company context for industry-aware content
      companyIndustry: (company as Record<string, unknown>)?.industry as string || undefined,
      companyDescription: (company as Record<string, unknown>)?.description as string || undefined,
      // Content Intelligence pre-generation context
      preGenerationContext: preGenContext,
    };

    let contentResult = await contentProvider.generate(generateInput);

    // ── Run post-generation quality gates ──────────────────────
    let qualityGates: GateResult[] = [];
    let retryCount = 0;
    const MAX_RETRIES = 2;

    try {
      qualityGates = await runPostGenerationGates({
        postTypeSlug,
        content: contentResult.markdownBody || "",
        hookLine: (contentResult.markdownBody || "").trim().split("\n")[0] || "",
        companyId,
        weekNumber: 0,
        isHealthcareCompany: ["healthcare", "pharma"].includes((company as Record<string, unknown>)?.industry as string || ""),
        contentType: "social_post",
        signoffText: isBlogTeaser ? undefined : (selectedSignoff?.signoff_text || undefined),
        firstComment: contentResult.firstComment,
        title: contentResult.title || "",
      });

      // Retry loop for critical gate failures
      while (hasCriticalFailures(qualityGates) && retryCount < MAX_RETRIES) {
        retryCount++;
        const fixInstructions = buildGateFixInstructions(qualityGates);

        // Create a fix provider to retry
        const contentProviderData = await resolveProvider(companyId, "content_generation");
        if (contentProviderData) {
          const { createClaudeFixProvider } = await import(
            "@/lib/providers/content-generation/anthropic"
          );
          const fixProvider = createClaudeFixProvider(
            contentProviderData.credentials,
            contentProviderData.settings
          );
          contentResult = await fixProvider.fix(contentResult, fixInstructions);

          // Re-run gates on fixed content
          qualityGates = await runPostGenerationGates({
            postTypeSlug,
            content: contentResult.markdownBody || "",
            hookLine: (contentResult.markdownBody || "").trim().split("\n")[0] || "",
            companyId,
            weekNumber: 0,
            isHealthcareCompany: ["healthcare", "pharma"].includes((company as Record<string, unknown>)?.industry as string || ""),
            contentType: "social_post",
            signoffText: isBlogTeaser ? undefined : (selectedSignoff?.signoff_text || undefined),
            firstComment: contentResult.firstComment,
            title: contentResult.title || "",
          });
        } else {
          break;
        }
      }
    } catch (gateErr) {
      // Quality gates are additive — don't block content delivery
      console.warn("[quick] Quality gate evaluation error:", gateErr);
    }

    // Separate warnings (high gates that failed but content is still returned)
    const warnings = qualityGates
      .filter((g) => !g.passed && (g.severity === "high" || g.severity === "critical"))
      .map((g) => ({ gate: g.gate, severity: g.severity, explanation: g.explanation }));

    // ── 3. Generate image ────────────────────────────────────────
    let imageUrl: string | null = null;
    let imagePrompt: string | null = null;
    let carouselImageUrls: string[] | null = null;

    // Resolve the effective image style for this post type.
    // Per-post-type mapping takes priority, then we check if the default
    // archetype should be overridden by a preferred style.
    let effectiveStyle = typeConfig.archetype; // e.g. "quote_card", "pixar_healthcare"
    let effectiveColor = postTypeOverride?.color;
    let effectiveCharacterDesc = postTypeOverride?.characterDescription;

    if (postTypeOverride?.imageStyle) {
      effectiveStyle = postTypeOverride.imageStyle;
    }

    // Normalize: map archetype names to style slugs for consistent lookup
    const archetypeToStyle: Record<string, string> = {
      quote_card: "quote_card",
      quote_card_green: "quote_card",
      quote_card_purple: "quote_card",
      quote_card_blue: "quote_card",
      pixar_healthcare: "pixar_3d",
      pixar_fantasy: "pixar_3d",
      carousel: "carousel_framework",
      editorial_photo: "editorial_photo",
      scene_quote: "scene_quote",
    };
    const styleSlug = archetypeToStyle[effectiveStyle] || effectiveStyle;

    const isQuoteCard = styleSlug === "quote_card";
    const isCarousel = styleSlug === "carousel_framework";
    const isSceneQuote = styleSlug === "scene_quote";
    const isSkip = styleSlug === "real_photo";

    // Check if the visual style is allowed on this plan
    // If not, fall back to quote card (always free, always available)
    if (!isVisualStyleAllowed(effectivePlan, styleSlug)) {
      console.log(`[quick] Style "${styleSlug}" not allowed on ${effectivePlan} plan — falling back to quote_card`);
      // Override to quote card
      effectiveStyle = "quote_card";
    }

    if (isQuoteCard) {
      try {
        // Extract the hook text (first line of content) for the card
        const hookText = contentResult.markdownBody?.trim().split("\n")[0] || topic;
        // Strip markdown formatting (bold, italic, etc.)
        let cleanHookText = hookText
          .replace(/\*\*/g, "")
          .replace(/\*/g, "")
          .replace(/^#+\s*/, "")
          .replace(/^[""]|[""]$/g, "")
          .trim();

        // ENFORCE max 12 words for quote cards — truncate if longer
        const words = cleanHookText.split(/\s+/);
        if (words.length > 12) {
          // Try to find a natural break point (period, comma, dash) within 12 words
          const truncated = words.slice(0, 12).join(" ");
          const lastPunc = Math.max(
            truncated.lastIndexOf("."),
            truncated.lastIndexOf(","),
            truncated.lastIndexOf("?"),
            truncated.lastIndexOf("!")
          );
          if (lastPunc > truncated.length * 0.5) {
            cleanHookText = truncated.slice(0, lastPunc + 1);
          } else {
            cleanHookText = truncated;
          }
        }

        // Resolve colour: per-post-type override > default for post type
        // Colour priority: per-post-type mapping > company brand colour > fallback palette
        // Colour priority: per-post-type mapping > brand palette (rotating) > single brand colour > defaults
        const brandPalette = (company as Record<string, unknown>)?.brand_palette as string[] | null;
        let paletteColor: string | undefined;
        if (brandPalette && brandPalette.length > 0) {
          // Rotate through palette based on post type index
          const postTypeIndex = Object.keys(QUOTE_CARD_COLORS).indexOf(postTypeSlug);
          paletteColor = brandPalette[Math.abs(postTypeIndex) % brandPalette.length];
        }
        const cardColor = effectiveColor || paletteColor || company?.brand_color || QUOTE_CARD_COLORS[postTypeSlug] || "#7C3AED";

        // Fetch spokesperson details for profile pic
        let profilePicUrl: string | null = null;
        let profileName: string | null = null;

        if (spokespersonId) {
          const { data: person } = await supabase
            .from("company_spokespersons")
            .select("name, photo_url, profile_picture_url")
            .eq("id", spokespersonId)
            .eq("company_id", companyId)
            .single();
          if (person) {
            profilePicUrl = person.photo_url || person.profile_picture_url || null;
            profileName = person.name;
          }
        }
        if (!profileName) {
          // Fall back to primary spokesperson or company default
          const { data: primaryPerson } = await supabase
            .from("company_spokespersons")
            .select("name, photo_url, profile_picture_url")
            .eq("company_id", companyId)
            .eq("is_primary", true)
            .limit(1)
            .single();
          if (primaryPerson) {
            profilePicUrl = profilePicUrl || primaryPerson.photo_url || primaryPerson.profile_picture_url || null;
            profileName = profileName || primaryPerson.name;
          }
        }
        if (!profilePicUrl) {
          // Try company-level profile picture
          const { data: companyDetails } = await supabase
            .from("companies")
            .select("profile_picture_url")
            .eq("id", companyId)
            .single();
          profilePicUrl = companyDetails?.profile_picture_url || null;
        }
        profileName = profileName || activeSpokesPerson?.name || company?.spokesperson_name || null;

        // Fetch company logo for bottom-right
        const { data: companyBrand } = await supabase
          .from("companies")
          .select("overlay_logo_url, logo_url, name")
          .eq("id", companyId)
          .single();

        const quoteResult = await generateQuoteCard({
          text: cleanHookText,
          color: cardColor,
          postType: postTypeSlug,
          profilePicUrl,
          profileName,
          logoUrl: companyBrand?.overlay_logo_url || companyBrand?.logo_url || null,
          companyName: companyBrand?.name || null,
          width: typeConfig.dimensions.width,
          height: typeConfig.dimensions.height,
        });

        // Upload to Supabase Storage
        const filename = `quote-card-${Date.now()}.png`;
        const storagePath = `images/${companyId}/quick/${filename}`;

        await supabase.storage.from("content-assets").upload(storagePath, quoteResult.buffer, {
          contentType: "image/png",
          upsert: true,
        });

        const { data: urlData } = supabase.storage
          .from("content-assets")
          .getPublicUrl(storagePath);
        imageUrl = urlData.publicUrl;
        imagePrompt = `[Programmatic quote card] "${cleanHookText}" on ${cardColor} background`;
      } catch (quoteErr) {
        console.warn("[quick] Programmatic quote card generation failed:", quoteErr);
        // Fall through — imageUrl stays null, content is still usable
      }
    } else if (isCarousel) {
      // Carousel: parse generated content into slides and render programmatically
      try {
        const body = contentResult.markdownBody || "";
        // Parse numbered points from the content (e.g. "1. Title\nBody text")
        const pointPattern = /(?:^|\n)(?:\d+[\.\)]\s*\*?\*?)(.+?)(?:\*?\*?\n)([\s\S]*?)(?=\n\d+[\.\)]\s|\n*$)/g;
        const contentSlides: { title: string; body?: string }[] = [];
        let match;
        while ((match = pointPattern.exec(body)) !== null) {
          const slideTitle = match[1].replace(/\*\*/g, "").trim();
          const slideBody = match[2].trim().replace(/\*\*/g, "").replace(/\n+/g, " ");
          if (slideTitle) {
            contentSlides.push({ title: slideTitle, body: slideBody || undefined });
          }
        }

        // Fallback: if no numbered points found, split by paragraphs
        if (contentSlides.length === 0) {
          const paragraphs = body.split(/\n\n+/).filter((p) => p.trim().length > 20);
          for (const p of paragraphs.slice(0, 5)) {
            const lines = p.trim().split("\n");
            contentSlides.push({
              title: lines[0].replace(/\*\*/g, "").replace(/^#+\s*/, "").trim(),
              body: lines.slice(1).join(" ").replace(/\*\*/g, "").trim() || undefined,
            });
          }
        }

        // Limit to 5 content slides
        const slides = contentSlides.slice(0, 5);
        if (slides.length > 0) {
          // Fetch branding
          const { data: companyBrand } = await supabase
            .from("companies")
            .select("overlay_logo_url, logo_url, name, brand_color")
            .eq("id", companyId)
            .single();

          // Fetch spokesperson for cover/CTA
          let carouselProfilePic: string | null = null;
          let carouselProfileName: string | null = null;
          if (spokespersonId) {
            const { data: person } = await supabase
              .from("company_spokespersons")
              .select("name, photo_url, profile_picture_url")
              .eq("id", spokespersonId)
              .eq("company_id", companyId)
              .single();
            if (person) {
              carouselProfilePic = person.photo_url || person.profile_picture_url || null;
              carouselProfileName = person.name;
            }
          }
          if (!carouselProfileName) {
            carouselProfileName = activeSpokesPerson?.name || company?.spokesperson_name || null;
          }

          const carouselSlides: CarouselSlide[] = [
            { type: "cover", title: contentResult.title || topic, body: `${slides.length} key insights` },
            ...slides.map((s, i) => ({
              type: "content" as const,
              slideNumber: i + 1,
              totalSlides: slides.length,
              title: s.title,
              body: s.body,
            })),
            { type: "cta", title: "Want to learn more?", body: carouselProfileName ? `Follow ${carouselProfileName} for more insights like this.` : undefined },
          ];

          const carouselResult = await generateCarousel({
            slides: carouselSlides,
            accentColor: effectiveColor || ((companyBrand as Record<string, unknown>)?.brand_palette as string[] | null)?.[0] || companyBrand?.brand_color || "#A27BF9",
            profilePicUrl: carouselProfilePic,
            profileName: carouselProfileName,
            logoUrl: companyBrand?.overlay_logo_url || companyBrand?.logo_url || null,
            companyName: companyBrand?.name || null,
          });

          // Upload all slides
          const timestamp = Date.now();
          carouselImageUrls = [];
          for (const slide of carouselResult.slides) {
            const filename = `carousel-${timestamp}-slide-${slide.slideIndex}.png`;
            const storagePath = `images/${companyId}/quick/${filename}`;
            await supabase.storage.from("content-assets").upload(storagePath, slide.buffer, {
              contentType: "image/png",
              upsert: true,
            });
            const { data: urlData } = supabase.storage
              .from("content-assets")
              .getPublicUrl(storagePath);
            carouselImageUrls.push(urlData.publicUrl);
          }
          // Use cover slide as the primary image
          imageUrl = carouselImageUrls[0] || null;
          imagePrompt = `[Programmatic carousel] ${slides.length} slides for "${topic}"`;
        }
      } catch (carouselErr) {
        console.warn("[quick] Carousel generation failed:", carouselErr);
      }
    } else if (isSceneQuote) {
      // Scene Quote: Gemini generates background scene, then we composite text
      try {
        const hookText = contentResult.markdownBody?.trim().split("\n")[0] || topic;
        let cleanHook = hookText.replace(/\*\*/g, "").replace(/\*/g, "").replace(/^#+\s*/, "").replace(/^[""]|[""]$/g, "").trim();
        const hookWords = cleanHook.split(/\s+/);
        if (hookWords.length > 12) cleanHook = hookWords.slice(0, 12).join(" ");

        const companyIndustry = (company as Record<string, unknown>)?.industry as string || (company as Record<string, unknown>)?.description as string || undefined;
        const scenePrompt = getScenePrompt(companyIndustry, topic);
        imagePrompt = scenePrompt;

        // Generate background with Gemini (or fal.ai fallback)
        const { createGeminiImageProvider } = await import("@/lib/providers/image-generation/gemini");
        const geminiKey = process.env.GOOGLE_GEMINI_API_KEY || "";
        let bgBuffer: Buffer | null = null;

        if (geminiKey) {
          const gemini = createGeminiImageProvider({ api_key: geminiKey }, {});
          const bgResult = await gemini.generate({ prompt: scenePrompt, count: 1 });
          if (bgResult.images.length > 0) {
            const imgUrl = bgResult.images[0].url;
            if (imgUrl.startsWith("data:")) {
              bgBuffer = Buffer.from(imgUrl.split(",")[1], "base64");
            } else {
              const res = await fetch(imgUrl);
              if (res.ok) bgBuffer = Buffer.from(await res.arrayBuffer());
            }
          }
        }

        if (bgBuffer) {
          const sceneResult = await generateSceneQuote({
            text: cleanHook,
            backgroundImage: bgBuffer,
            accentColor: effectiveColor || company?.brand_color || "#7C3AED",
          });

          const filename = `scene-quote-${Date.now()}.png`;
          const storagePath = `images/${companyId}/quick/${filename}`;
          await supabase.storage.from("content-assets").upload(storagePath, sceneResult.buffer, {
            contentType: "image/png",
            upsert: true,
          });
          const { data: urlData } = supabase.storage.from("content-assets").getPublicUrl(storagePath);
          imageUrl = urlData.publicUrl;
          imagePrompt = `[Scene quote] "${cleanHook}" on ${scenePrompt.slice(0, 100)}`;
        }
      } catch (sceneErr) {
        console.warn("[quick] Scene quote generation failed:", sceneErr);
      }
    } else if (isSkip) {
      // real_photo style — user provides their own photos, no generation
      imageUrl = null;
      imagePrompt = null;
    } else {
      // AI image generation with smart provider routing
      try {
        // Route to optimal provider based on image style
        // Check for company-specific provider override first
        const companyRouting = (company as Record<string, unknown>)?.provider_routing as Record<string, string> | null;
        const providerOverride = companyRouting?.[styleSlug];

        const hasRefPhotos = !!(spokespersonId && styleSlug === "pixar_3d");
        const route = routeImageStyle(styleSlug, hasRefPhotos);

        // Use company override if set and not "auto", otherwise use smart routing
        const effectiveProviderKey = (providerOverride && providerOverride !== "auto")
          ? providerOverride as "gemini_imagen" | "fal_flux" | "openai_gpt_image"
          : getEffectiveProvider(route.provider);
        console.log(`[quick] Image routing: ${route.reason}${providerOverride ? ` (override: ${providerOverride})` : ""} → using ${effectiveProviderKey}`);

        // Get the routed provider (may differ from company default)
        let imgProvider;
        if (effectiveProviderKey === "gemini_imagen") {
          // Use Gemini directly if available
          const { createGeminiImageProvider } = await import("@/lib/providers/image-generation/gemini");
          imgProvider = createGeminiImageProvider(
            { api_key: process.env.GOOGLE_GEMINI_API_KEY || "" },
            {}
          );
        } else {
          // Fall back to company's configured provider (likely fal.ai)
          const result = await getImageProvider(companyId);
          imgProvider = result.provider;
        }

        const appearance = effectiveCharacterDesc
          || activeSpokesPerson?.appearance
          || company?.spokesperson_appearance
          || DEFAULT_APPEARANCE;

        // Use style override prompt if available, otherwise fall back to post type config
        const stylePromptTemplate = STYLE_PROMPTS[styleSlug];
        let resolvedStyle: string;

        if (stylePromptTemplate && stylePromptTemplate !== "PROGRAMMATIC" && stylePromptTemplate !== "SKIP") {
          resolvedStyle = typeof stylePromptTemplate === "function"
            ? stylePromptTemplate(appearance)
            : stylePromptTemplate;
        } else {
          // Fall back to the hardcoded post type config
          resolvedStyle = typeof typeConfig.imageStyle === "function"
            ? typeConfig.imageStyle(appearance)
            : typeConfig.imageStyle;
        }

        const rawPrompt = `${resolvedStyle} Scene illustrating: ${topic.slice(0, 120)}`;

        imagePrompt = rawPrompt;

        // Enhance with Claude if available
        const contentProviderData = await resolveProvider(companyId, "content_generation");
        const claudeApiKey = contentProviderData?.credentials?.api_key as string | undefined;
        const enhancedPrompt = claudeApiKey
          ? await enhanceImagePrompt(rawPrompt, styleSlug, claudeApiKey)
          : rawPrompt;

        // Resolve dimensions: square for most styles, 4:3 for 3D/Pixar
        const is3DStyle = styleSlug === "pixar_3d";
        const aspectRatio = is3DStyle ? "4:3" : "1:1";

        // For person-depicting styles (Pixar/3D), fetch reference photos
        // to enable face-consistent generation via PuLID
        let referenceImageUrls: string[] | undefined;
        if (is3DStyle) {
          const personId = spokespersonId || null;
          if (personId) {
            // List reference photos from Supabase Storage
            const { data: refFiles } = await supabase.storage
              .from("content-assets")
              .list(`reference-photos/${companyId}/${personId}`, { limit: 3 });
            if (refFiles && refFiles.length > 0 && isFaceMatchAllowed(effectivePlan)) {
              referenceImageUrls = refFiles.map((f) => {
                const { data: urlData } = supabase.storage
                  .from("content-assets")
                  .getPublicUrl(`reference-photos/${companyId}/${personId}/${f.name}`);
                return urlData.publicUrl;
              });
            } else if (refFiles && refFiles.length > 0) {
              console.log(`[quick] Face-match photos found but plan "${effectivePlan}" does not include PuLID — using generic Pixar`);
            }
          }
        }

        const imgResult = await imgProvider.generate({
          prompt: enhancedPrompt,
          style: styleSlug,
          aspectRatio,
          count: 1,
          referenceImageUrls,
        });

        if (imgResult.images.length > 0) {
          // Upload to permanent storage
          const imgUrl = imgResult.images[0].url;
          const filename = `quick-${Date.now()}.png`;
          const storagePath = `images/${companyId}/quick/${filename}`;

          let buffer: Buffer;
          if (imgUrl.startsWith("data:")) {
            // Gemini returns base64 data URIs — decode directly
            const base64Data = imgUrl.split(",")[1];
            buffer = Buffer.from(base64Data, "base64");
          } else {
            // fal.ai / OpenAI return HTTP URLs — fetch the image
            const imgRes = await fetch(imgUrl, { signal: AbortSignal.timeout(30_000) });
            if (!imgRes.ok) throw new Error(`Image fetch failed: ${imgRes.status}`);
            buffer = Buffer.from(await imgRes.arrayBuffer());
          }

          await supabase.storage.from("content-assets").upload(storagePath, buffer, {
            contentType: "image/png",
            upsert: true,
          });
          const { data: urlData } = supabase.storage
            .from("content-assets")
            .getPublicUrl(storagePath);
          imageUrl = urlData.publicUrl;
        }
      } catch (imgErr) {
        // Image generation is optional — content is still usable without it
        console.warn("[quick] Image generation failed:", imgErr);
      }
    }

    return NextResponse.json({
      postText: contentResult.markdownBody || "",
      firstComment: contentResult.firstComment || null,
      imageUrl,
      imagePrompt: imagePrompt || contentResult.imagePrompt || null,
      carouselImageUrls,
      qualityGates,
      warnings,
    });
  } catch (err) {
    console.error("[quick] Generation failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Generation failed" },
      { status: 500 }
    );
  }
}

// Labels for post types (used in content generation prompt)
const POST_TYPES_LABELS: Record<string, string> = {
  insight: "Problem Diagnosis",
  launch_story: "Experience Story",
  if_i_was: "Expert Perspective",
  contrarian: "Contrarian Take",
  tactical: "Tactical How-To",
  founder_friday: "Personal Reflection",
  blog_teaser: "Article Teaser",
  personal_update: "Personal Update",
  scene_provocation: "Scene Provocation",
};
