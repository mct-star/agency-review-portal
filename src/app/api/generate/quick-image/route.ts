import { NextResponse } from "next/server";
import { requireCompanyUser, createAdminSupabaseClient } from "@/lib/supabase/admin";
import { getImageProvider, resolveProvider } from "@/lib/providers";
import { enhanceImagePrompt } from "@/lib/providers/image-generation/prompt-enhancer";

/**
 * POST /api/generate/quick-image
 *
 * Regenerate just the image for Quick Generate, without re-generating text.
 * Uses the same prompt to produce a fresh variation (image models are non-deterministic).
 *
 * Body: {
 *   companyId: string,
 *   imagePrompt: string,
 *   archetype: string,        // e.g. "pixar_healthcare", "quote_card"
 *   aspectRatio?: string,     // "1:1" or "4:3", defaults to "1:1"
 * }
 */
export async function POST(request: Request) {
  const body = await request.json();
  const { companyId, imagePrompt, archetype, aspectRatio } = body;

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
