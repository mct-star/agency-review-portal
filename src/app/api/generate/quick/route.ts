import { NextResponse } from "next/server";
import { requireAdmin, createAdminSupabaseClient } from "@/lib/supabase/admin";
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
import { getEffectivePlan } from "@/lib/utils/get-effective-plan";
import { checkPostLimit } from "@/lib/utils/plan-limits";
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
  real_photo: "SKIP", // User-uploaded photos, no generation
  flat_illustration: "Modern flat vector illustration with clean lines and bold shapes. Minimal detail, geometric forms. Professional and approachable. Limited colour palette with one accent colour. Concept-level abstraction.",
};

const POST_TYPE_CONFIG: Record<string, PostTypeConfig> = {
  insight: {
    archetype: "quote_card",
    imageStyle: "Flat solid green (#CDD856) background, edge to edge. Bold italic white text centred in middle third. Max 12 words. No scenes, people, objects, gradients, textures. The power comes from the emptiness.",
    dimensions: { width: 1080, height: 1080 },
  },
  launch_story: {
    archetype: "pixar_healthcare",
    imageStyle: (appearance) =>
      `Pixar/Disney-adjacent 3D rendered scene in a hospital/healthcare environment. Sophisticated lighting, slightly exaggerated proportions. Main character: ${appearance}. The Pixar character should clearly resemble this person. NHS hospital setting with medical props.`,
    dimensions: { width: 1080, height: 1350 },
  },
  if_i_was: {
    archetype: "quote_card",
    imageStyle: "Flat solid purple (#A27BF9) background, edge to edge. Bold italic white text centred in middle third. Max 12 words. Hand-drawn black arrow curving downward beneath the text. No scenes, people, objects, gradients, textures.",
    dimensions: { width: 1080, height: 1080 },
  },
  contrarian: {
    archetype: "quote_card",
    imageStyle: "Flat solid blue (#41C9FE) background, edge to edge. Bold italic white text centred in middle third. Max 12 words. Accusation, revelation, or confrontation tone. No scenes, people, objects, gradients, textures.",
    dimensions: { width: 1080, height: 1080 },
  },
  tactical: {
    archetype: "carousel",
    imageStyle: "Clean white background with purple (#A27BF9) accents. Typography-led framework slide. Oversized purple number + heading + body text. Generous whitespace. Line-art icon. Professional, airy layout.",
    dimensions: { width: 1080, height: 1080 },
  },
  founder_friday: {
    archetype: "pixar_fantasy",
    imageStyle: (appearance) =>
      `Pixar/Disney-adjacent 3D rendered scene showing a 'fantasy vs reality' moment. Split composition or contrasting elements. Main character: ${appearance}. The Pixar character should clearly resemble this person. Warm, intimate lighting. Candid, reflective moment.`,
    dimensions: { width: 1080, height: 1350 },
  },
  blog_teaser: {
    archetype: "carousel",
    imageStyle: "Clean white background. Cover slide for a carousel: icon + title + subtitle + 'Swipe >' indicator. Purple (#A27BF9) accent colour. AGENCY branding. Typography-led, airy, generous whitespace.",
    dimensions: { width: 1080, height: 1080 },
  },
};

export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { companyId, spokespersonId, topic, postTypeSlug, platform } = body;

  if (!companyId || !topic || !postTypeSlug) {
    return NextResponse.json(
      { error: "companyId, topic, and postTypeSlug are required" },
      { status: 400 }
    );
  }

  const supabase = await createAdminSupabaseClient();
  const typeConfig = POST_TYPE_CONFIG[postTypeSlug] || POST_TYPE_CONFIG.insight;

  try {
    // ── 1. Fetch company context + spokesperson ─────────────────
    const { data: company } = await supabase
      .from("companies")
      .select("name, spokesperson_name, brand_color, spokesperson_appearance, preferred_image_styles, post_type_image_mapping, plan, trial_plan, trial_expires_at")
      .eq("id", companyId)
      .single();

    // ── Plan enforcement ──────────────────────────────────────
    if (company) {
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
      isHealthcareCompany: true, // Default to healthcare; could be company-specific
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
      signoffText: isBlogTeaser ? undefined : (selectedSignoff?.signoff_text || undefined),
      firstCommentTemplate: isBlogTeaser ? undefined : (selectedSignoff?.first_comment_template || undefined),
      // Inject full voice profile (structured or legacy)
      voicePrompt: voicePromptText || undefined,
      voiceDescription: !voicePromptText ? (voiceProfile?.voice_description || undefined) : undefined,
      bannedVocabulary: !voicePromptText ? (voiceProfile?.banned_vocabulary || undefined) : undefined,
      signatureDevices: !voicePromptText ? (voiceProfile?.signature_devices || undefined) : undefined,
      additionalContext: `Platform: ${platform || "linkedin"}. This is a standalone quick-generated post, not part of a weekly ecosystem.${blogTeaserContext ? `\n\n${blogTeaserContext}` : ""}`,
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
        isHealthcareCompany: true,
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
            isHealthcareCompany: true,
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
      pixar_healthcare: "pixar_3d",
      pixar_fantasy: "pixar_3d",
      carousel: "carousel_framework",
    };
    const styleSlug = archetypeToStyle[effectiveStyle] || effectiveStyle;

    const isQuoteCard = styleSlug === "quote_card";
    const isCarousel = styleSlug === "carousel_framework";
    const isSkip = styleSlug === "real_photo";

    if (isQuoteCard) {
      try {
        // Extract the hook text (first line of content) for the card
        const hookText = contentResult.markdownBody?.trim().split("\n")[0] || topic;
        // Strip markdown formatting (bold, italic, etc.)
        const cleanHookText = hookText
          .replace(/\*\*/g, "")
          .replace(/\*/g, "")
          .replace(/^#+\s*/, "")
          .replace(/^[""]|[""]$/g, "")
          .trim();

        // Resolve colour: per-post-type override > default for post type
        // Colour priority: per-post-type mapping > company brand colour > fallback palette
        const cardColor = effectiveColor || company?.brand_color || QUOTE_CARD_COLORS[postTypeSlug] || "#7C3AED";

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
            accentColor: effectiveColor || companyBrand?.brand_color || "#A27BF9",
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
    } else if (isSkip) {
      // real_photo style — user provides their own photos, no generation
      imageUrl = null;
      imagePrompt = null;
    } else {
      // AI image generation with smart provider routing
      try {
        // Route to optimal provider based on image style
        const hasRefPhotos = !!(spokespersonId && styleSlug === "pixar_3d");
        const route = routeImageStyle(styleSlug, hasRefPhotos);
        const effectiveProviderKey = getEffectiveProvider(route.provider);
        console.log(`[quick] Image routing: ${route.reason} → using ${effectiveProviderKey}`);

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
            if (refFiles && refFiles.length > 0) {
              referenceImageUrls = refFiles.map((f) => {
                const { data: urlData } = supabase.storage
                  .from("content-assets")
                  .getPublicUrl(`reference-photos/${companyId}/${personId}/${f.name}`);
                return urlData.publicUrl;
              });
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
};
