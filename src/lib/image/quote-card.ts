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
  /** Background colour as hex (e.g. "#8AB80A") */
  color: string;
  /** Post type slug — used for default colour lookup if color not provided */
  postType: string;
  /** Show hand-drawn arrow pointing down (visual pull into post body) */
  showArrow?: boolean;
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

/**
 * Default vibrant colour palette for quote cards.
 * These are RICH, SATURATED, HIGH-CONTRAST colours designed to
 * stop the scroll on LinkedIn. Not pastels, not muted.
 *
 * When a company has brand colours configured, those take priority.
 * These are the fallbacks for companies without brand colour settings.
 */
export const QUOTE_CARD_COLORS: Record<string, string> = {
  insight: "#8AB80A",        // Vivid lime green — punchy, high energy
  if_i_was: "#7C3AED",       // Deep violet — rich, authoritative
  contrarian: "#0EA5E9",     // Electric blue — bold, attention-grabbing
  tactical: "#D97706",       // Rich amber — warm, urgent
  founder_friday: "#DC2626", // Vibrant red — passion, conviction
  blog_teaser: "#059669",    // Deep emerald — trust, depth
};

/**
 * Ensures a colour is vibrant enough for a scroll-stopping card.
 * If the colour is too light (high lightness), darkens it.
 * If too desaturated, boosts saturation.
 */
export function ensureVibrantColor(hex: string): string {
  // Parse hex to RGB
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);

  // Convert to HSL
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  let s = 0;
  let h = 0;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6;
    else if (max === gn) h = ((bn - rn) / d + 2) / 6;
    else h = ((rn - gn) / d + 4) / 6;
  }

  // Enforce minimum saturation (60%) and cap lightness (25-55%)
  const newS = Math.max(s, 0.6);
  const newL = Math.min(Math.max(l, 0.25), 0.55);

  // Convert back to RGB
  function hsl2rgb(h: number, s: number, l: number): [number, number, number] {
    if (s === 0) return [l, l, l];
    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1/6) return p + (q - p) * 6 * t;
      if (t < 1/2) return q;
      if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    return [hue2rgb(p, q, h + 1/3), hue2rgb(p, q, h), hue2rgb(p, q, h - 1/3)];
  }

  const [nr, ng, nb] = hsl2rgb(h, newS, newL);
  const toHex = (n: number) => Math.round(n * 255).toString(16).padStart(2, "0");
  return `#${toHex(nr)}${toHex(ng)}${toHex(nb)}`;
}

// ============================================================
// Font loading (shared with brand-overlay.ts)
// ============================================================

let _fontDataCache: ArrayBuffer | null = null;
function getFontData(): ArrayBuffer {
  if (_fontDataCache) return _fontDataCache;
  // Use ExtraBold (800) to match production cards — punchy, high-impact
  const fontPath = join(process.cwd(), "src/lib/image/fonts/Poppins-ExtraBold.ttf");
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
 * Returns a hand-drawn pencil-style underline swoosh.
 * Sits beneath the text — a loose, organic line that adds
 * visual energy and pulls the eye down into the post body.
 */
function handDrawnArrowSvg(width: number): string {
  const w = Math.round(width * 0.55); // Swoosh width = ~55% of card
  const startX = Math.round(width * 0.08); // Start at left padding
  return `
    <svg width="${width}" height="80" viewBox="0 0 ${width} 80" xmlns="http://www.w3.org/2000/svg">
      <!-- Main pencil swoosh line -->
      <path
        d="M ${startX} 35
           C ${startX + w * 0.2} 25, ${startX + w * 0.35} 45, ${startX + w * 0.5} 32
           C ${startX + w * 0.65} 20, ${startX + w * 0.8} 40, ${startX + w} 28"
        fill="none"
        stroke="white"
        stroke-width="3.5"
        stroke-linecap="round"
        stroke-linejoin="round"
        opacity="0.85"
      />
      <!-- Small flick at the end -->
      <path
        d="M ${startX + w - 8} 30 L ${startX + w} 28 L ${startX + w + 12} 22"
        fill="none"
        stroke="white"
        stroke-width="3"
        stroke-linecap="round"
        opacity="0.7"
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

  // Ensure the background colour is vibrant enough to stop the scroll
  config.color = ensureVibrantColor(config.color);

  // ── Production-matched layout ────────────────────────────
  // LEFT-ALIGNED text, ExtraBold weight, large font filling the canvas.
  // Clean — no profile pic or logo overlays (brand overlay is a separate step).
  // Text sits in the middle-to-lower-left area of the card.

  const wordCount = config.text.split(/\s+/).length;
  let fontSize: number;
  if (wordCount <= 4) {
    fontSize = Math.round(width * 0.09);  // ~97px at 1080 — very punchy
  } else if (wordCount <= 8) {
    fontSize = Math.round(width * 0.075); // ~81px at 1080
  } else if (wordCount <= 12) {
    fontSize = Math.round(width * 0.065); // ~70px at 1080
  } else {
    fontSize = Math.round(width * 0.055); // ~59px at 1080
  }

  const lineHeight = 1.2;
  const padding = Math.round(width * 0.08); // 8% padding all sides

  // Main quote text — LEFT-ALIGNED, middle-to-lower area
  const quoteText = React.createElement(
    "div",
    {
      style: {
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        textAlign: "left",
        color: "white",
        fontSize,
        fontFamily: "Poppins",
        fontWeight: 800,
        lineHeight,
        width: "100%",
      },
    },
    config.text
  );

  // Full layout — clean, text-only
  const layout = React.createElement(
    "div",
    {
      style: {
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        width,
        height,
        backgroundColor: config.color,
        position: "relative",
        padding,
        paddingTop: Math.round(height * 0.15), // Push text slightly below centre
      },
    },
    quoteText
  );

  // ── Render with Satori ───────────────────────────────────

  const svg = await satori(layout, {
    width,
    height,
    fonts: [
      {
        name: "Poppins",
        data: fontData,
        weight: 800,
        style: "normal" as const,
      },
    ],
  });

  // ── Convert SVG to PNG with Sharp ────────────────────────

  let imageBuffer = await sharp(Buffer.from(svg))
    .png()
    .toBuffer();

  // ── Add hand-drawn arrow (optional on any card, default on if_i_was) ──

  if (config.showArrow || config.postType === "if_i_was") {
    const arrowSvg = handDrawnArrowSvg(width);
    const arrowBuffer = await sharp(Buffer.from(arrowSvg))
      .png()
      .toBuffer();

    // Position swoosh in the lower third, left-aligned to match text
    imageBuffer = await sharp(imageBuffer)
      .composite([
        {
          input: arrowBuffer,
          top: Math.round(height * 0.72),
          left: 0,
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
