/**
 * Brand Overlay System — "Copy Magic" Mask
 *
 * Composites a company's brand identity onto generated images using Sharp.
 * Matches the atom mask format used in AGENCY's production workflow:
 *
 * Layout:
 * ┌──────────────────────────────────┐
 * │                                  │  ← Generated image
 * │                                  │
 * │                                  │
 * │                   [COMPANY LOGO] │  ← Top-right: company logo
 * │                                  │
 * │  ┌─────────────────────────────┐ │
 * │  │ ●  Name                     │ │  ← Bottom: gradient fade bar
 * │  │    Follow [Name]            │ │     with circular profile photo,
 * │  └─────────────────────────────┘ │     name, and CTA text
 * └──────────────────────────────────┘
 *
 * Each company gets their own brand colour, profile photo, logo,
 * and CTA text. The mask format is universal; the inputs are per-brand.
 */

import sharp from "sharp";

// ============================================================
// Types
// ============================================================

export interface BrandOverlayConfig {
  /** Company brand colour (hex, e.g. "#41CDA9") */
  brandColor: string;
  /** Company logo URL (PNG with transparency preferred) */
  logoUrl?: string | null;
  /** Spokesperson display name */
  spokespersonName?: string | null;
  /** Spokesperson profile picture URL */
  profilePictureUrl?: string | null;
  /** CTA text for the overlay (e.g. "Follow Michael Colling-Tuck") */
  ctaText?: string | null;
  /** Image archetype for style-specific treatments */
  archetype?: string | null;
  /** Optional hook text to overlay (for quote card archetypes) */
  hookText?: string | null;
  /**
   * URL of a transparent PNG brand mask template.
   * When provided, this mask is composited on top of the generated image instead of
   * (or in addition to) the dynamic SVG overlay. The mask should be 1:1 with
   * transparent areas where the base image shows through.
   */
  brandMaskUrl?: string | null;
}

export interface OverlayResult {
  /** The processed image as a Buffer */
  buffer: Buffer;
  /** MIME type of the output */
  mimeType: string;
  /** Width of the output */
  width: number;
  /** Height of the output */
  height: number;
}

// ============================================================
// Colour utilities
// ============================================================

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace("#", "");
  return {
    r: parseInt(clean.substring(0, 2), 16),
    g: parseInt(clean.substring(2, 4), 16),
    b: parseInt(clean.substring(4, 6), 16),
  };
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// ============================================================
// SVG generators for overlay elements
// ============================================================

/**
 * Creates the bottom gradient bar with spokesperson name and CTA.
 * Uses a gradient fade from transparent to brand colour (matching atom mask).
 */
function createBottomBar(
  width: number,
  height: number,
  brandColor: string,
  name: string | null,
  ctaText: string | null,
  hasProfilePhoto: boolean
): string {
  const barHeight = Math.round(height * 0.14); // 14% — taller to accommodate name + CTA
  const { r, g, b } = hexToRgb(brandColor);
  const nameSize = Math.round(barHeight * 0.3);
  const ctaSize = Math.round(barHeight * 0.2);

  // If we have a profile photo, leave space for it on the left
  const textX = hasProfilePhoto
    ? Math.round(width * 0.04) + Math.round(barHeight * 0.65) + 12
    : Math.round(width * 0.04);

  return `<svg width="${width}" height="${height}">
    <defs>
      <linearGradient id="bottomFade" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="rgba(${r},${g},${b},0)" />
        <stop offset="40%" stop-color="rgba(${r},${g},${b},0.6)" />
        <stop offset="100%" stop-color="rgba(${r},${g},${b},0.92)" />
      </linearGradient>
    </defs>
    <!-- Gradient fade bar at bottom -->
    <rect x="0" y="${height - barHeight}" width="${width}" height="${barHeight}"
          fill="url(#bottomFade)" />
    ${name ? `
    <text x="${textX}" y="${height - Math.round(barHeight * 0.45)}"
          font-family="DejaVu Sans, Liberation Sans, Noto Sans, sans-serif" font-size="${nameSize}"
          font-weight="bold" fill="white">
      ${escapeXml(name)}
    </text>` : ""}
    ${ctaText ? `
    <text x="${textX}" y="${height - Math.round(barHeight * 0.18)}"
          font-family="DejaVu Sans, Liberation Sans, Noto Sans, sans-serif" font-size="${ctaSize}"
          font-weight="400" fill="rgba(255,255,255,0.85)">
      ${escapeXml(ctaText)}
    </text>` : ""}
  </svg>`;
}

// ============================================================
// Main overlay function
// ============================================================

/**
 * Apply brand overlay to a generated image.
 * Matches the AGENCY atom mask format:
 * - Bottom gradient bar with brand colour
 * - Circular profile photo (bottom-left)
 * - Spokesperson name + CTA text
 * - Company logo (top-right)
 *
 * @param imageSource - URL or Buffer of the source image
 * @param config - Brand overlay configuration
 * @returns Processed image buffer with overlay
 */
export async function applyBrandOverlay(
  imageSource: string | Buffer,
  config: BrandOverlayConfig
): Promise<OverlayResult> {
  // Load the source image
  let imageBuffer: Buffer;

  if (typeof imageSource === "string") {
    const res = await fetch(imageSource);
    if (!res.ok) throw new Error(`Failed to download image: ${res.status}`);
    const arrayBuffer = await res.arrayBuffer();
    imageBuffer = Buffer.from(arrayBuffer);
  } else {
    imageBuffer = imageSource;
  }

  // Get image dimensions
  const metadata = await sharp(imageBuffer).metadata();
  const width = metadata.width || 1024;
  const height = metadata.height || 1024;

  // Build the overlay layers
  const composites: sharp.OverlayOptions[] = [];

  // Derive CTA text if not provided
  const ctaText = config.ctaText
    || (config.spokespersonName ? `Follow ${config.spokespersonName}` : null);

  const hasProfilePhoto = !!config.profilePictureUrl;

  // Layer 1: Bottom gradient bar with name + CTA
  const barSvg = createBottomBar(
    width,
    height,
    config.brandColor,
    config.spokespersonName || null,
    ctaText,
    hasProfilePhoto
  );
  composites.push({
    input: Buffer.from(barSvg),
    top: 0,
    left: 0,
  });

  // Layer 2: Circular profile photo (bottom-left, inside the gradient bar)
  if (config.profilePictureUrl) {
    try {
      const profileRes = await fetch(config.profilePictureUrl);
      if (profileRes.ok) {
        const profileArrayBuffer = await profileRes.arrayBuffer();
        const rawProfileBuffer = Buffer.from(profileArrayBuffer);
        const barHeight = Math.round(height * 0.14);
        const photoSize = Math.round(barHeight * 0.65);
        const margin = Math.round(width * 0.04);

        // Create circular crop using Sharp
        const circularMask = Buffer.from(
          `<svg width="${photoSize}" height="${photoSize}">
            <circle cx="${photoSize / 2}" cy="${photoSize / 2}" r="${photoSize / 2}" fill="white"/>
          </svg>`
        );

        const circularPhoto = await sharp(rawProfileBuffer)
          .resize(photoSize, photoSize, { fit: "cover" })
          .composite([{
            input: circularMask,
            blend: "dest-in",
          }])
          .png()
          .toBuffer();

        // Add a subtle border ring
        const borderSize = photoSize + 4;
        const { r, g, b } = hexToRgb(config.brandColor);
        const borderRing = Buffer.from(
          `<svg width="${borderSize}" height="${borderSize}">
            <circle cx="${borderSize / 2}" cy="${borderSize / 2}" r="${borderSize / 2}"
                    fill="none" stroke="rgba(${r},${g},${b},0.8)" stroke-width="2"/>
          </svg>`
        );

        const photoWithBorder = await sharp(
          Buffer.from(`<svg width="${borderSize}" height="${borderSize}"><rect width="${borderSize}" height="${borderSize}" fill="transparent"/></svg>`)
        )
          .resize(borderSize, borderSize)
          .composite([
            { input: borderRing, top: 0, left: 0 },
            { input: circularPhoto, top: 2, left: 2 },
          ])
          .png()
          .toBuffer();

        composites.push({
          input: photoWithBorder,
          top: height - barHeight + Math.round((barHeight - borderSize) / 2),
          left: margin,
        });
      }
    } catch {
      // Profile photo fetch failed — continue without it
    }
  }

  // Layer 3: Logo (top-right)
  if (config.logoUrl) {
    try {
      const logoRes = await fetch(config.logoUrl);
      if (logoRes.ok) {
        const logoArrayBuffer = await logoRes.arrayBuffer();
        const rawLogoBuffer = Buffer.from(logoArrayBuffer);
        const logoWidth = Math.round(width * 0.12);
        const margin = Math.round(width * 0.03);

        const resizedLogo = await sharp(rawLogoBuffer)
          .resize(logoWidth, null, { fit: "inside" })
          .toBuffer();

        composites.push({
          input: resizedLogo,
          top: margin,
          left: width - logoWidth - margin,
        });
      }
    } catch {
      // Logo fetch failed — continue without it
    }
  }

  // If a custom brand mask PNG is provided, use it as the top-most layer
  // instead of the dynamic SVG composites (the mask has the brand frame baked in).
  if (config.brandMaskUrl) {
    try {
      const maskRes = await fetch(config.brandMaskUrl);
      if (maskRes.ok) {
        const maskArrayBuffer = await maskRes.arrayBuffer();
        const maskBuffer = await sharp(Buffer.from(maskArrayBuffer))
          .resize(width, height, { fit: "fill" }) // stretch mask to match image dimensions
          .png()
          .toBuffer();

        // Apply the static mask on top of the base image (clear any dynamic composites
        // when a brand mask is present — the mask replaces the dynamic overlay)
        const result = await sharp(imageBuffer)
          .composite([{ input: maskBuffer, blend: "over" }])
          .png()
          .toBuffer();

        return { buffer: result, mimeType: "image/png", width, height };
      }
    } catch {
      // Mask fetch/composite failed — fall through to dynamic overlay below
    }
  }

  // Apply dynamic SVG composites (logo, profile photo, gradient bar)
  const result = await sharp(imageBuffer)
    .composite(composites)
    .png()
    .toBuffer();

  return {
    buffer: result,
    mimeType: "image/png",
    width,
    height,
  };
}
