/**
 * Programmatic Quote Card Generator
 *
 * Generates quote card images server-side using Satori (JSX → SVG) + Sharp (SVG → PNG).
 * Replaces AI-generated quote cards which garble text.
 *
 * Output matches AGENCY production examples:
 * ┌──────────────────────────────────┐
 * │  ● Follow Name                  │  ← Top-left: circular profile pic + CTA
 * │                                  │
 * │                                  │
 * │       Bold white quote text      │  ← Centre-to-lower third
 * │       across multiple lines      │
 * │                                  │
 * │              ↓ (if_i_was only)   │  ← Hand-drawn arrow
 * │                                  │
 * │                        AGENCY ○  │  ← Bottom-right: logo text or image
 * └──────────────────────────────────┘
 *
 * Flat solid colour background, edge-to-edge. No gradients, textures, or scenes.
 */

import sharp from "sharp";
import satori from "satori";
import React from "react";
import { readFileSync } from "fs";
import { join } from "path";

// ============================================================
// Types
// ============================================================

export interface QuoteCardConfig {
  /** The quote text to display (max ~12 words for best results) */
  text: string;
  /** Background colour as hex (e.g. "#CDD856") */
  color: string;
  /** Post type slug — determines special treatments like the arrow on if_i_was */
  postType: string;
  /** Spokesperson profile picture URL */
  profilePicUrl?: string | null;
  /** Spokesperson display name */
  profileName?: string | null;
  /** Company logo URL (white/transparent PNG preferred) */
  logoUrl?: string | null;
  /** Company name fallback if no logo URL */
  companyName?: string | null;
  /** Output width in pixels (default 1080) */
  width?: number;
  /** Output height in pixels (default 1080) */
  height?: number;
}

export interface QuoteCardResult {
  /** The generated image as a Buffer */
  buffer: Buffer;
  /** MIME type */
  mimeType: string;
  /** Image width */
  width: number;
  /** Image height */
  height: number;
}

// ============================================================
// Colour mapping by post type
// ============================================================

export const QUOTE_CARD_COLORS: Record<string, string> = {
  insight: "#CDD856",        // Green — Monday Problem / insight posts
  if_i_was: "#A27BF9",       // Purple — Wednesday expert perspective
  contrarian: "#41C9FE",     // Blue — Thursday contrarian takes
  tactical: "#CDD856",       // Green — Thursday tactical
  founder_friday: "#A27BF9", // Purple — Friday
  blog_teaser: "#CDD856",    // Green — Sunday
};

// ============================================================
// Font loading (shared with brand-overlay.ts)
// ============================================================

let _fontDataCache: ArrayBuffer | null = null;
function getFontData(): ArrayBuffer {
  if (_fontDataCache) return _fontDataCache;
  const fontPath = join(process.cwd(), "src/lib/image/fonts/Poppins-SemiBold.ttf");
  const buffer = readFileSync(fontPath);
  _fontDataCache = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  return _fontDataCache;
}

// ============================================================
// Helper: fetch image as buffer
// ============================================================

async function fetchImageBuffer(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  }
}

// ============================================================
// Hand-drawn arrow SVG path (for if_i_was cards)
// ============================================================

/**
 * Returns a hand-drawn style curved arrow that swoops down.
 * Rendered as white strokes to match the text colour.
 */
function handDrawnArrowSvg(width: number): string {
  // Arrow centered horizontally, swooping from top-left to bottom-right
  const cx = width / 2;
  return `
    <svg width="${width}" height="120" viewBox="0 0 ${width} 120" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M ${cx - 60} 15 C ${cx - 40} 10, ${cx + 20} 25, ${cx + 10} 55
           C ${cx} 75, ${cx - 30} 85, ${cx + 15} 95"
        fill="none"
        stroke="white"
        stroke-width="4"
        stroke-linecap="round"
        stroke-linejoin="round"
        opacity="0.9"
      />
      <!-- Arrowhead -->
      <path
        d="M ${cx + 5} 85 L ${cx + 15} 95 L ${cx + 2} 93"
        fill="none"
        stroke="white"
        stroke-width="4"
        stroke-linecap="round"
        stroke-linejoin="round"
        opacity="0.9"
      />
    </svg>
  `;
}

// ============================================================
// Main generator
// ============================================================

export async function generateQuoteCard(config: QuoteCardConfig): Promise<QuoteCardResult> {
  const width = config.width || 1080;
  const height = config.height || 1080;
  const fontData = getFontData();

  // Calculate font size based on text length for optimal readability
  const wordCount = config.text.split(/\s+/).length;
  let fontSize: number;
  if (wordCount <= 4) {
    fontSize = Math.round(width * 0.065); // ~70px at 1080
  } else if (wordCount <= 8) {
    fontSize = Math.round(width * 0.055); // ~60px at 1080
  } else {
    fontSize = Math.round(width * 0.046); // ~50px at 1080
  }

  const lineHeight = 1.45;
  const textMarginX = Math.round(width * 0.15); // 15% margin each side = 70% text width

  // Profile pic dimensions
  const profileSize = Math.round(width * 0.05); // ~54px at 1080
  const profileMargin = Math.round(width * 0.04);
  const followFontSize = Math.round(width * 0.018); // ~20px at 1080

  // ── Build the Satori JSX layout ──────────────────────────

  // Profile section (top-left)
  const profileSection = config.profileName
    ? React.createElement(
        "div",
        {
          style: {
            display: "flex",
            flexDirection: "row",
            alignItems: "center",
            position: "absolute",
            top: profileMargin,
            left: profileMargin,
          },
        },
        // Profile pic circle
        config.profilePicUrl
          ? React.createElement("img", {
              src: config.profilePicUrl,
              width: profileSize,
              height: profileSize,
              style: {
                borderRadius: "50%",
                objectFit: "cover",
                marginRight: 12,
              },
            })
          : React.createElement("div", {
              style: {
                width: profileSize,
                height: profileSize,
                borderRadius: "50%",
                backgroundColor: "rgba(255,255,255,0.3)",
                marginRight: 12,
              },
            }),
        // "Follow Name" text
        React.createElement(
          "div",
          {
            style: {
              display: "flex",
              flexDirection: "column",
              color: "white",
              fontSize: followFontSize,
              fontFamily: "Poppins",
            },
          },
          React.createElement(
            "span",
            { style: { opacity: 0.8, fontSize: Math.round(followFontSize * 0.85) } },
            "Follow"
          ),
          React.createElement(
            "span",
            { style: { fontWeight: 700 } },
            config.profileName
          )
        )
      )
    : null;

  // Logo / company name (bottom-right)
  const logoMargin = Math.round(width * 0.04);
  const logoSection = config.logoUrl
    ? React.createElement("img", {
        src: config.logoUrl,
        height: Math.round(width * 0.04),
        style: {
          position: "absolute",
          bottom: logoMargin,
          right: logoMargin,
          opacity: 0.9,
        },
      })
    : config.companyName
    ? React.createElement(
        "div",
        {
          style: {
            position: "absolute",
            bottom: logoMargin,
            right: logoMargin,
            color: "white",
            fontSize: Math.round(width * 0.022),
            fontFamily: "Poppins",
            fontWeight: 600,
            opacity: 0.7,
            letterSpacing: 2,
          },
        },
        config.companyName.toUpperCase()
      )
    : null;

  // Main quote text — centred in the middle-to-lower third
  const quoteText = React.createElement(
    "div",
    {
      style: {
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        color: "white",
        fontSize,
        fontFamily: "Poppins",
        fontWeight: 600,
        lineHeight,
        paddingLeft: textMarginX,
        paddingRight: textMarginX,
        // Push text into middle-to-lower third
        marginTop: Math.round(height * 0.08),
        width: "100%",
      },
    },
    config.text
  );

  // Full layout
  const layout = React.createElement(
    "div",
    {
      style: {
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        width,
        height,
        backgroundColor: config.color,
        position: "relative",
      },
    },
    profileSection,
    quoteText,
    logoSection
  );

  // ── Render with Satori ───────────────────────────────────

  const svg = await satori(layout, {
    width,
    height,
    fonts: [
      {
        name: "Poppins",
        data: fontData,
        weight: 600,
        style: "normal" as const,
      },
    ],
  });

  // ── Convert SVG to PNG with Sharp ────────────────────────

  let imageBuffer = await sharp(Buffer.from(svg))
    .png()
    .toBuffer();

  // ── Add hand-drawn arrow for if_i_was cards ──────────────

  if (config.postType === "if_i_was") {
    const arrowSvg = handDrawnArrowSvg(width);
    const arrowBuffer = await sharp(Buffer.from(arrowSvg))
      .resize(Math.round(width * 0.25), 120, { fit: "inside" })
      .png()
      .toBuffer();

    // Position arrow below centre (roughly 65% from top)
    imageBuffer = await sharp(imageBuffer)
      .composite([
        {
          input: arrowBuffer,
          top: Math.round(height * 0.65),
          left: Math.round((width - width * 0.25) / 2),
        },
      ])
      .png()
      .toBuffer();
  }

  return {
    buffer: imageBuffer,
    mimeType: "image/png",
    width,
    height,
  };
}
