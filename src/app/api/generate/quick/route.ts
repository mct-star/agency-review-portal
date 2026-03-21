import { NextResponse } from "next/server";
import { requireAdmin, createAdminSupabaseClient } from "@/lib/supabase/admin";
import { getContentProvider, getImageProvider, resolveProvider } from "@/lib/providers";
import { enhanceImagePrompt } from "@/lib/providers/image-generation/prompt-enhancer";

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
  const { companyId, topic, postTypeSlug, platform } = body;

  if (!companyId || !topic || !postTypeSlug) {
    return NextResponse.json(
      { error: "companyId, topic, and postTypeSlug are required" },
      { status: 400 }
    );
  }

  const supabase = await createAdminSupabaseClient();
  const typeConfig = POST_TYPE_CONFIG[postTypeSlug] || POST_TYPE_CONFIG.insight;

  try {
    // ── 1. Fetch company context ──────────────────────────────────
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

    // Fetch the matching signoff for this post type
    const { data: signoffs } = await supabase
      .from("company_signoffs")
      .select("*")
      .eq("company_id", companyId)
      .eq("is_active", true)
      .order("sort_order");

    const matchedSignoff = signoffs?.find(
      (s) =>
        Array.isArray(s.applies_to_post_types) &&
        s.applies_to_post_types.length > 0 &&
        s.applies_to_post_types.includes(postTypeSlug)
    );
    const defaultSignoff = signoffs?.find(
      (s) => !Array.isArray(s.applies_to_post_types) || s.applies_to_post_types.length === 0
    );
    const selectedSignoff = matchedSignoff || defaultSignoff || signoffs?.[0] || null;

    // ── 2. Generate content ───────────────────────────────────────
    const { provider: contentProvider } = await getContentProvider(companyId);

    const contentResult = await contentProvider.generate({
      blueprintContent: blueprint?.blueprint_text || "",
      topicTitle: topic,
      topicDescription: null,
      pillar: null,
      audienceTheme: null,
      contentType: "social_post",
      weekNumber: 0,
      spokespersonName: company?.spokesperson_name || null,
      postTypeSlug,
      postTypeLabel: POST_TYPES_LABELS[postTypeSlug] || postTypeSlug,
      imageArchetype: typeConfig.archetype,
      signoffText: selectedSignoff?.signoff_text || undefined,
      firstCommentTemplate: selectedSignoff?.first_comment_template || undefined,
      additionalContext: `Platform: ${platform || "linkedin"}. This is a standalone quick-generated post, not part of a weekly ecosystem.`,
    });

    // ── 3. Generate image (if provider configured) ────────────────
    let imageUrl: string | null = null;
    let imagePrompt: string | null = null;

    try {
      const { provider: imgProvider } = await getImageProvider(companyId);

      // Build an image prompt from the content + archetype style.
      // For Pixar archetypes, inject the spokesperson's appearance description
      // so the character resembles the real person's profile picture.
      const appearance = company?.spokesperson_appearance || DEFAULT_APPEARANCE;
      const resolvedStyle = typeof typeConfig.imageStyle === "function"
        ? typeConfig.imageStyle(appearance)
        : typeConfig.imageStyle;

      const hookText = contentResult.markdownBody?.split("\n")[0] || topic;
      const rawPrompt = typeConfig.archetype.includes("quote_card")
        ? `${resolvedStyle} Text on image: "${hookText.slice(0, 60)}"`
        : `${resolvedStyle} Scene illustrating: ${topic.slice(0, 120)}`;

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

    return NextResponse.json({
      postText: contentResult.markdownBody || "",
      firstComment: contentResult.firstComment || null,
      imageUrl,
      imagePrompt: imagePrompt || contentResult.imagePrompt || null,
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
  insight: "The Mistake / Insight",
  launch_story: "Launch Story (47 Launches)",
  if_i_was: "If I Was...",
  contrarian: "Contrarian Take",
  tactical: "Tactical How-To",
  founder_friday: "Founder Friday (Fantasy vs Reality)",
  blog_teaser: "Blog Teaser",
};
