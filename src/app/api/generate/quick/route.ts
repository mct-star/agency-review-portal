import { NextResponse } from "next/server";
import { requireAdmin, createAdminSupabaseClient } from "@/lib/supabase/admin";
import { getContentProvider, getImageProvider, resolveProvider } from "@/lib/providers";
import { enhanceImagePrompt } from "@/lib/providers/image-generation/prompt-enhancer";
import { buildVoicePrompt } from "@/lib/voice-to-prompt";
import {
  buildPreGenerationContext,
  runPostGenerationGates,
  buildGateFixInstructions,
  hasCriticalFailures,
  type GateResult,
} from "@/lib/generation/content-intelligence";
import { generateQuoteCard, QUOTE_CARD_COLORS } from "@/lib/image/quote-card";

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
      .select("name, spokesperson_name, brand_color, spokesperson_appearance")
      .eq("id", companyId)
      .single();

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

    // For quote_card archetypes, use the programmatic quote card generator
    // instead of AI image generation (which garbles text).
    const isQuoteCard = typeConfig.archetype === "quote_card";

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

        // Resolve colour from post type
        const cardColor = QUOTE_CARD_COLORS[postTypeSlug] || "#CDD856";

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
    } else {
      // Non-quote-card archetypes: use AI image generation as before
      try {
        const { provider: imgProvider } = await getImageProvider(companyId);

        const appearance = activeSpokesPerson?.appearance || company?.spokesperson_appearance || DEFAULT_APPEARANCE;
        const resolvedStyle = typeof typeConfig.imageStyle === "function"
          ? typeConfig.imageStyle(appearance)
          : typeConfig.imageStyle;

        const hookText = contentResult.markdownBody?.split("\n")[0] || topic;
        const rawPrompt = `${resolvedStyle} Scene illustrating: ${topic.slice(0, 120)}`;

        imagePrompt = rawPrompt;

        // Enhance with Claude if available
        const contentProviderData = await resolveProvider(companyId, "content_generation");
        const claudeApiKey = contentProviderData?.credentials?.api_key as string | undefined;
        const enhancedPrompt = claudeApiKey
          ? await enhanceImagePrompt(rawPrompt, typeConfig.archetype, claudeApiKey)
          : rawPrompt;

        const imgResult = await imgProvider.generate({
          prompt: enhancedPrompt,
          style: typeConfig.archetype,
          aspectRatio: typeConfig.dimensions.width === typeConfig.dimensions.height ? "1:1" : "4:3",
          count: 1,
        });

        if (imgResult.images.length > 0) {
          // Upload to permanent storage
          const imgUrl = imgResult.images[0].url;
          const filename = `quick-${Date.now()}.png`;
          const storagePath = `images/${companyId}/quick/${filename}`;

          const imgRes = await fetch(imgUrl, { signal: AbortSignal.timeout(30_000) });
          if (imgRes.ok) {
            const buffer = Buffer.from(await imgRes.arrayBuffer());
            await supabase.storage.from("content-assets").upload(storagePath, buffer, {
              contentType: "image/png",
              upsert: true,
            });
            const { data: urlData } = supabase.storage
              .from("content-assets")
              .getPublicUrl(storagePath);
            imageUrl = urlData.publicUrl;
          }
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
