import { NextResponse } from "next/server";
import { requireAdmin, createAdminSupabaseClient } from "@/lib/supabase/admin";
import { applyBrandOverlay } from "@/lib/image/brand-overlay";

/**
 * POST /api/generate/overlay
 *
 * Applies a company's brand overlay to a generated image.
 *
 * Body: {
 *   imageUrl: string,           // URL of the source image
 *   companyId: string,          // Company whose branding to apply
 *   contentPieceId?: string,    // Optional: link result to a content piece
 *   archetype?: string,         // Optional: archetype-specific treatment
 *   hookText?: string,          // Optional: text to overlay (for quote cards)
 * }
 *
 * Returns the overlaid image as a downloadable PNG, or stores it
 * in Supabase Storage and returns the public URL.
 */
export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { imageUrl, companyId, contentPieceId, archetype, hookText } = body;

  if (!imageUrl || !companyId) {
    return NextResponse.json(
      { error: "imageUrl and companyId are required" },
      { status: 400 }
    );
  }

  const supabase = await createAdminSupabaseClient();

  // Fetch company branding + profile picture
  const { data: company } = await supabase
    .from("companies")
    .select("spokesperson_name, brand_color, logo_url, profile_picture_url")
    .eq("id", companyId)
    .single();

  if (!company) {
    return NextResponse.json({ error: "Company not found" }, { status: 404 });
  }

  // Also check for spokesperson from company_spokespersons table
  const { data: primarySpokesperson } = await supabase
    .from("company_spokespersons")
    .select("name, photo_url, tagline, linkedin_url")
    .eq("company_id", companyId)
    .eq("is_primary", true)
    .limit(1)
    .single();

  const spokespersonName = primarySpokesperson?.name || company.spokesperson_name;
  const profilePicUrl = primarySpokesperson?.photo_url || company.profile_picture_url;

  try {
    // Apply the overlay.
    // If a custom brand mask PNG is uploaded, it takes precedence over the
    // dynamically generated SVG overlay (the mask already contains the brand frame).
    const result = await applyBrandOverlay(imageUrl, {
      brandColor: company.brand_color || "#0a66c2",
      logoUrl: company.logo_url,
      spokespersonName,
      profilePictureUrl: profilePicUrl,
      ctaText: spokespersonName ? `Follow ${spokespersonName}` : null,
      archetype: archetype || null,
      hookText: hookText || null,
      brandMaskUrl: null, // TODO: re-enable once migration 011 (brand_mask_url column) is applied
    });

    // Store the branded image in Supabase Storage
    const timestamp = Date.now();
    const storagePath = `branded/${companyId}/${timestamp}_branded.png`;

    const { error: uploadErr } = await supabase.storage
      .from("media")
      .upload(storagePath, result.buffer, {
        contentType: "image/png",
        upsert: false,
      });

    if (uploadErr) {
      // If storage isn't set up, return the image directly as base64
      const base64 = result.buffer.toString("base64");
      return NextResponse.json({
        url: `data:image/png;base64,${base64}`,
        storagePath: null,
        width: result.width,
        height: result.height,
        storageError: uploadErr.message,
      });
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from("media")
      .getPublicUrl(storagePath);

    const publicUrl = urlData.publicUrl;

    // If linked to a content piece, update or create the branded image
    if (contentPieceId) {
      // Check if there's an existing branded image for this piece
      const { data: existingImages } = await supabase
        .from("content_images")
        .select("id")
        .eq("content_piece_id", contentPieceId)
        .eq("archetype", "branded")
        .limit(1);

      if (existingImages && existingImages.length > 0) {
        // Update existing
        await supabase
          .from("content_images")
          .update({
            public_url: publicUrl,
            storage_path: storagePath,
            filename: `branded-${timestamp}.png`,
          })
          .eq("id", existingImages[0].id);
      } else {
        // Create new
        await supabase.from("content_images").insert({
          content_piece_id: contentPieceId,
          filename: `branded-${timestamp}.png`,
          storage_path: storagePath,
          public_url: publicUrl,
          archetype: "branded",
          sort_order: 10,
        });
      }
    }

    return NextResponse.json({
      url: publicUrl,
      storagePath,
      width: result.width,
      height: result.height,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Overlay failed" },
      { status: 500 }
    );
  }
}
