import { NextResponse } from "next/server";
import { requireCompanyUser, createAdminSupabaseClient } from "@/lib/supabase/admin";
import { getImageProvider, resolveProvider } from "@/lib/providers";
import { enhanceImagePrompt } from "@/lib/providers/image-generation/prompt-enhancer";
import { generateQuoteCard, QUOTE_CARD_COLORS } from "@/lib/image/quote-card";

/**
 * POST /api/generate/quick-image
 *
 * Regenerate just the image for Quick Generate, without re-generating text.
 * Uses the same prompt to produce a fresh variation (image models are non-deterministic).
 *
 * For quote_card archetypes, uses the programmatic quote card generator
 * instead of AI image generation (which garbles text).
 *
 * Body: {
 *   companyId: string,
 *   imagePrompt: string,
 *   archetype: string,        // e.g. "pixar_healthcare", "quote_card"
 *   aspectRatio?: string,     // "1:1" or "4:3", defaults to "1:1"
 *   postTypeSlug?: string,    // For quote cards: determines colour + arrow
 *   hookText?: string,        // For quote cards: the text to render
 *   spokespersonId?: string,  // For quote cards: specific spokesperson
 * }
 */
export async function POST(request: Request) {
  const body = await request.json();
  const { companyId, imagePrompt, archetype, aspectRatio, postTypeSlug, hookText, spokespersonId } = body;

  if (!companyId || !imagePrompt) {
    return NextResponse.json(
      { error: "companyId and imagePrompt are required" },
      { status: 400 }
    );
  }

  const profile = await requireCompanyUser(companyId);
  if (!profile) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = await createAdminSupabaseClient();

  // ── Quote card: use programmatic generator ────────────────
  if (archetype === "quote_card") {
    try {
      // Extract hook text from the imagePrompt if not provided separately
      // The imagePrompt format is: [Programmatic quote card] "text here" on #color background
      let cardText = hookText || "";
      if (!cardText && imagePrompt) {
        const match = imagePrompt.match(/[""]([^""]+)[""]/);
        cardText = match ? match[1] : imagePrompt;
      }

      const cardColor = QUOTE_CARD_COLORS[postTypeSlug || ""] || "#CDD856";

      // Fetch spokesperson details
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
        const { data: primaryPerson } = await supabase
          .from("company_spokespersons")
          .select("name, photo_url, profile_picture_url")
          .eq("company_id", companyId)
          .eq("is_primary", true)
          .limit(1)
          .single();
        if (primaryPerson) {
          profilePicUrl = profilePicUrl || primaryPerson.photo_url || primaryPerson.profile_picture_url || null;
          profileName = primaryPerson.name;
        }
      }
      if (!profilePicUrl) {
        const { data: companyDetails } = await supabase
          .from("companies")
          .select("profile_picture_url, spokesperson_name")
          .eq("id", companyId)
          .single();
        profilePicUrl = companyDetails?.profile_picture_url || null;
        profileName = profileName || companyDetails?.spokesperson_name || null;
      }

      // Fetch company logo
      const { data: companyBrand } = await supabase
        .from("companies")
        .select("overlay_logo_url, logo_url, name")
        .eq("id", companyId)
        .single();

      const quoteResult = await generateQuoteCard({
        text: cardText,
        color: cardColor,
        postType: postTypeSlug || "insight",
        profilePicUrl,
        profileName,
        logoUrl: companyBrand?.overlay_logo_url || companyBrand?.logo_url || null,
        companyName: companyBrand?.name || null,
      });

      // Upload to storage
      const filename = `quote-card-${Date.now()}.png`;
      const storagePath = `images/${companyId}/quick/${filename}`;

      await supabase.storage.from("content-assets").upload(storagePath, quoteResult.buffer, {
        contentType: "image/png",
        upsert: true,
      });

      const { data: urlData } = supabase.storage
        .from("content-assets")
        .getPublicUrl(storagePath);

      return NextResponse.json({ imageUrl: urlData.publicUrl });
    } catch (err) {
      console.error("[quick-image] Quote card regeneration failed:", err);
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Quote card generation failed" },
        { status: 500 }
      );
    }
  }

  // ── Non-quote-card: use AI image generation as before ─────
  try {
    const { provider: imgProvider } = await getImageProvider(companyId);

    // Enhance with Claude if available
    const contentProviderData = await resolveProvider(companyId, "content_generation");
    const claudeApiKey = contentProviderData?.credentials?.api_key as string | undefined;
    const enhancedPrompt = claudeApiKey
      ? await enhanceImagePrompt(imagePrompt, archetype || "default", claudeApiKey)
      : imagePrompt;

    const imgResult = await imgProvider.generate({
      prompt: enhancedPrompt,
      style: archetype || "default",
      aspectRatio: aspectRatio || "1:1",
      count: 1,
    });

    if (imgResult.images.length === 0) {
      return NextResponse.json({ error: "No image generated" }, { status: 500 });
    }

    // Upload to permanent storage
    const imgUrl = imgResult.images[0].url;
    const filename = `quick-${Date.now()}.png`;
    const storagePath = `images/${companyId}/quick/${filename}`;

    const imgRes = await fetch(imgUrl, { signal: AbortSignal.timeout(30_000) });
    if (!imgRes.ok) {
      return NextResponse.json({ error: "Failed to download generated image" }, { status: 500 });
    }

    const buffer = Buffer.from(await imgRes.arrayBuffer());
    await supabase.storage.from("content-assets").upload(storagePath, buffer, {
      contentType: "image/png",
      upsert: true,
    });

    const { data: urlData } = supabase.storage
      .from("content-assets")
      .getPublicUrl(storagePath);

    return NextResponse.json({ imageUrl: urlData.publicUrl });
  } catch (err) {
    console.error("[quick-image] Regeneration failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Image generation failed" },
      { status: 500 }
    );
  }
}
