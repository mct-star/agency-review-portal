/**
 * Brand Overlay System
 *
 * Composites a company's brand identity onto generated images using Sharp.
 * Each company has its own overlay configuration:
 * - Brand colour bar at the bottom
 * - Company logo in corner
 * - Spokesperson name + profile picture in header
 * - Archetype-specific treatments (optional)
 *
 * The overlay is non-destructive — it creates a new image with the
 * brand elements composited on top of the original.
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
  /** Image archetype for style-specific treatments */
  archetype?: string | null;
  /** Optional hook text to overlay (for quote card archetypes) */
  hookText?: string | null;
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

// ============================================================
// SVG generators for overlay elements
// ============================================================

function createBottomBar(width: number, height: number, brandColor: string, name: string | null): string {
  const barHeight = Math.round(height * 0.08); // 8% of image height
  const fontSize = Math.round(barHeight * 0.45);
  const { r, g, b } = hexToRgb(brandColor);

  return `<svg width="${width}" height="${height}">
    <!-- Semi-transparent brand bar at bottom -->
    <rect x="0" y="${height - barHeight}" width="${width}" height="${barHeight}"
          fill="rgba(${r}, ${g}, ${b}, 0.9)" />
    ${name ? `
    <text x="${Math.round(width * 0.04)}" y="${height - Math.round(barHeight * 0.32)}"
          font-family="Arial, Helvetica, sans-serif" font-size="${fontSize}"
          font-weight="bold" fill="white">
      ${escapeXml(name)}
    </text>` : ""}
  </svg>`;
}

function createLogoComposite(
  logoBuffer: Buffer,
  imageWidth: number,
  imageHeight: number
): { buffer: Buffer; left: number; top: number } {
  // Logo goes in top-right corner, about 15% of image width
  const logoWidth = Math.round(imageWidth * 0.15);
  const margin = Math.round(imageWidth * 0.03);

  return {
    buffer: logoBuffer,
    left: imageWidth - logoWidth - margin,
    top: margin,
  };
}

function createProfileBadge(
  width: number,
  height: number,
  name: string,
  brandColor: string
): string {
  const badgeHeight = Math.round(height * 0.07);
  const fontSize = Math.round(badgeHeight * 0.5);
  const padding = Math.round(width * 0.03);
  const initials = name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
  const circleR = Math.round(badgeHeight * 0.4);
  const { r, g, b } = hexToRgb(brandColor);

  return `<svg width="${width}" height="${height}">
    <!-- Profile badge in top-left -->
    <rect x="${padding}" y="${padding}" width="${Math.round(width * 0.35)}" height="${badgeHeight}"
          rx="${Math.round(badgeHeight * 0.3)}" fill="rgba(0, 0, 0, 0.6)" />
    <circle cx="${padding + circleR + 6}" cy="${padding + Math.round(badgeHeight / 2)}" r="${circleR}"
            fill="rgba(${r}, ${g}, ${b}, 1)" />
    <text x="${padding + circleR + 6}" y="${padding + Math.round(badgeHeight / 2) + Math.round(fontSize * 0.15)}"
          font-family="Arial, Helvetica, sans-serif" font-size="${Math.round(fontSize * 0.6)}"
          font-weight="bold" fill="white" text-anchor="middle"
          dominant-baseline="middle">
      ${escapeXml(initials)}
    </text>
    <text x="${padding + circleR * 2 + 14}" y="${padding + Math.round(badgeHeight / 2) + Math.round(fontSize * 0.15)}"
          font-family="Arial, Helvetica, sans-serif" font-size="${Math.round(fontSize * 0.7)}"
          font-weight="600" fill="white"
          dominant-baseline="middle">
      ${escapeXml(name)}
    </text>
  </svg>`;
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
// Main overlay function
// ============================================================

/**
 * Apply brand overlay to a generated image.
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

  // Layer 1: Bottom brand bar with name
  const barSvg = createBottomBar(width, height, config.brandColor, config.spokespersonName || null);
  composites.push({
    input: Buffer.from(barSvg),
    top: 0,
    left: 0,
  });

  // Layer 2: Profile badge (top-left)
  if (config.spokespersonName) {
    const badgeSvg = createProfileBadge(width, height, config.spokespersonName, config.brandColor);
    composites.push({
      input: Buffer.from(badgeSvg),
      top: 0,
      left: 0,
    });
  }

  // Layer 3: Logo (top-right)
  if (config.logoUrl) {
    try {
      const logoRes = await fetch(config.logoUrl);
      if (logoRes.ok) {
        const logoArrayBuffer = await logoRes.arrayBuffer();
        const rawLogoBuffer = Buffer.from(logoArrayBuffer);
        const logoWidth = Math.round(width * 0.12);

        const resizedLogo = await sharp(rawLogoBuffer)
          .resize(logoWidth, null, { fit: "inside" })
          .toBuffer();

        const margin = Math.round(width * 0.03);

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

  // Apply all composites
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
