import { NextResponse } from "next/server";
import { requireAdmin, createAdminSupabaseClient } from "@/lib/supabase/admin";
import { applyBrandOverlay } from "@/lib/image/brand-overlay";
import sharp from "sharp";

/**
 * GET /api/generate/overlay/preview?companyId=...
 *
 * Generates a preview of the brand overlay using a sample gradient image.
 * Uses the company's uploaded logo, profile picture, brand colour,
 * and spokesperson name to show exactly what the overlay will look like
 * on generated images.
 *
 * Returns: { url: "data:image/png;base64,..." }
 */
export async function GET(request: Request) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const companyId = searchParams.get("companyId");
  const spokespersonId = searchParams.get("spokespersonId"); // optional: show person-specific overlay

  if (!companyId) {
    return NextResponse.json({ error: "companyId required" }, { status: 400 });
  }

  const supabase = await createAdminSupabaseClient();

  const { data: company, error: companyErr } = await supabase
    .from("companies")
    .select("name, spokesperson_name, brand_color, logo_url, overlay_logo_url, profile_picture_url")
    .eq("id", companyId)
    .single();

  if (!company) {
    return NextResponse.json(
      { error: `Company not found (${companyErr?.message || "no data"})` },
      { status: 404 }
    );
  }

  // If a specific spokesperson is requested, use their details
  // Otherwise use the primary spokesperson for the preview image, but company name for CTA
  let spokespersonName: string | null = null;
  let profilePicUrl: string | null = null;
  let ctaName: string | null = null; // Name shown in "Follow X" CTA

  if (spokespersonId) {
    // Person-specific overlay: "Follow [person name]"
    try {
      const { data } = await supabase
        .from("company_spokespersons")
        .select("name, photo_url")
        .eq("id", spokespersonId)
        .eq("company_id", companyId)
        .single();
      if (data) {
        spokespersonName = data.name;
        profilePicUrl = data.photo_url;
        ctaName = data.name;
      }
    } catch {
      // Fall through
    }
  } else {
    // Company-level overlay: "Follow [company name]"
    try {
      const { data } = await supabase
        .from("company_spokespersons")
        .select("name, photo_url")
        .eq("company_id", companyId)
        .eq("is_primary", true)
        .limit(1)
        .single();
      if (data) {
        spokespersonName = data.name;
        profilePicUrl = data.photo_url;
      }
    } catch {
      // Table may not exist yet
    }
    spokespersonName = spokespersonName || company.spokesperson_name;
    profilePicUrl = profilePicUrl || company.profile_picture_url;
    ctaName = company.name; // Company name for company-level CTA
  }

  try {
    // Create a sample 1024×1024 gradient image as the base
    // Uses a soft gradient that looks like a typical AI-generated image
    const sampleImage = await createSampleImage(1024, 1024, company.brand_color || "#0a66c2");

    const result = await applyBrandOverlay(sampleImage, {
      brandColor: company.brand_color || "#0a66c2",
      logoUrl: company.overlay_logo_url || company.logo_url,
      spokespersonName,
      profilePictureUrl: profilePicUrl,
      ctaText: ctaName ? `Follow ${ctaName}` : null,
      archetype: null,
      hookText: null,
      brandMaskUrl: null,
    });

    const base64 = result.buffer.toString("base64");
    return NextResponse.json({
      url: `data:image/png;base64,${base64}`,
      width: result.width,
      height: result.height,
      hasLogo: !!(company.overlay_logo_url || company.logo_url),
      hasOverlayLogo: !!company.overlay_logo_url,
      hasProfilePic: !!profilePicUrl,
      hasName: !!spokespersonName,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Preview generation failed" },
      { status: 500 }
    );
  }
}

/**
 * Creates a sample base image with a soft gradient and placeholder content.
 * Mimics a typical AI-generated healthcare scene so the overlay preview
 * looks realistic.
 */
async function createSampleImage(
  width: number,
  height: number,
  brandColor: string
): Promise<Buffer> {
  // Create a pleasant gradient background with subtle brand colour influence
  const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#1a1a2e" />
        <stop offset="40%" stop-color="#16213e" />
        <stop offset="70%" stop-color="#0f3460" />
        <stop offset="100%" stop-color="#1a1a2e" />
      </linearGradient>
      <radialGradient id="glow" cx="0.6" cy="0.4" r="0.5">
        <stop offset="0%" stop-color="${brandColor}" stop-opacity="0.15" />
        <stop offset="100%" stop-color="transparent" />
      </radialGradient>
    </defs>
    <rect width="${width}" height="${height}" fill="url(#bg)" />
    <rect width="${width}" height="${height}" fill="url(#glow)" />

    <!-- Placeholder shapes suggesting a scene -->
    <rect x="${width * 0.1}" y="${height * 0.25}" width="${width * 0.35}" height="${height * 0.4}" rx="12"
          fill="rgba(255,255,255,0.04)" />
    <rect x="${width * 0.55}" y="${height * 0.15}" width="${width * 0.35}" height="${height * 0.5}" rx="12"
          fill="rgba(255,255,255,0.03)" />
    <circle cx="${width * 0.3}" cy="${height * 0.35}" r="40" fill="rgba(255,255,255,0.06)" />
    <circle cx="${width * 0.7}" cy="${height * 0.3}" r="30" fill="rgba(255,255,255,0.05)" />

    <!-- Subtle crosshair to indicate sample area (no text — fonts unavailable on Lambda) -->
    <line x1="${width / 2 - 30}" y1="${height / 2}" x2="${width / 2 + 30}" y2="${height / 2}"
          stroke="rgba(255,255,255,0.08)" stroke-width="1" />
    <line x1="${width / 2}" y1="${height / 2 - 30}" x2="${width / 2}" y2="${height / 2 + 30}"
          stroke="rgba(255,255,255,0.08)" stroke-width="1" />
  </svg>`;

  return sharp(Buffer.from(svg)).png().toBuffer();
}
