import { NextResponse } from "next/server";
import { requireAdmin, createAdminSupabaseClient } from "@/lib/supabase/admin";
import { generateQuoteCard, QUOTE_CARD_COLORS } from "@/lib/image/quote-card";

/**
 * POST /api/generate/quote-card
 *
 * Generates a programmatic quote card image — flat colour background with
 * bold white text. Replaces AI-generated quote cards which garble text.
 *
 * Body: {
 *   text: string;            // The quote text (ideally max 12 words)
 *   color?: string;          // Hex colour override (e.g. "#CDD856")
 *   postType?: string;       // Post type slug — determines colour + arrow
 *   profilePicUrl?: string;  // Spokesperson photo URL
 *   profileName?: string;    // Spokesperson display name
 *   logoUrl?: string;        // Company overlay logo URL (white/transparent)
 *   companyName?: string;    // Fallback company name if no logo
 *   companyId?: string;      // If provided, uploads to Supabase Storage
 *   width?: number;          // Default 1080
 *   height?: number;         // Default 1080
 * }
 *
 * Returns:
 *   { imageUrl: string } if companyId provided (uploaded to storage)
 *   { imageBase64: string } otherwise (data URI)
 */
export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const {
    text,
    color,
    postType,
    profilePicUrl,
    profileName,
    logoUrl,
    companyName,
    companyId,
    width,
    height,
  } = body;

  if (!text) {
    return NextResponse.json(
      { error: "text is required" },
      { status: 400 }
    );
  }

  // Resolve colour: explicit > postType mapping > default green
  const resolvedColor =
    color || QUOTE_CARD_COLORS[postType || ""] || "#CDD856";

  try {
    const result = await generateQuoteCard({
      text,
      color: resolvedColor,
      postType: postType || "insight",
      profilePicUrl,
      profileName,
      logoUrl,
      companyName,
      width,
      height,
    });

    // If companyId provided, upload to Supabase Storage and return URL
    if (companyId) {
      const supabase = await createAdminSupabaseClient();
      const filename = `quote-card-${Date.now()}.png`;
      const storagePath = `images/${companyId}/quick/${filename}`;

      const { error: uploadErr } = await supabase.storage
        .from("content-assets")
        .upload(storagePath, result.buffer, {
          contentType: "image/png",
          upsert: true,
        });

      if (uploadErr) {
        console.warn("[quote-card] Storage upload failed, returning base64:", uploadErr.message);
        const base64 = result.buffer.toString("base64");
        return NextResponse.json({
          imageUrl: `data:image/png;base64,${base64}`,
          width: result.width,
          height: result.height,
          storageError: uploadErr.message,
        });
      }

      const { data: urlData } = supabase.storage
        .from("content-assets")
        .getPublicUrl(storagePath);

      return NextResponse.json({
        imageUrl: urlData.publicUrl,
        width: result.width,
        height: result.height,
      });
    }

    // No companyId — return as base64
    const base64 = result.buffer.toString("base64");
    return NextResponse.json({
      imageUrl: `data:image/png;base64,${base64}`,
      width: result.width,
      height: result.height,
    });
  } catch (err) {
    console.error("[quote-card] Generation failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Quote card generation failed" },
      { status: 500 }
    );
  }
}
