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
// Hand-drawn arrow SVG variants
// ============================================================

type ArrowVariant = "none" | "curved" | "squiggly";

/**
 * Randomly selects an arrow variant for the quote card.
 * ~33% plain (no arrow), ~33% curved arrow, ~33% squiggly arrow.
 */
function pickArrowVariant(): ArrowVariant {
  const variants: ArrowVariant[] = ["none", "curved", "squiggly"];
  return variants[Math.floor(Math.random() * variants.length)];
}

/**
 * Curved hand-drawn arrow pointing downward.
 * Matches the AGENCY production template — thick dark stroke,
 * organic curve, arrowhead at the bottom.
 */
function curvedArrowSvg(width: number, height: number): string {
  const cx = Math.round(width * 0.45); // Centre the arrow horizontally
  const startY = 20;
  const endY = height - 20;
  const midY = Math.round(height * 0.5);

  return `
    <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
      <!-- Main curved line -->
      <path
        d="M ${cx + 30} ${startY}
           C ${cx + 60} ${midY * 0.4}, ${cx - 40} ${midY}, ${cx} ${endY - 40}"
        fill="none"
        stroke="rgba(0,0,0,0.7)"
        stroke-width="5"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      <!-- Arrowhead -->
      <path
        d="M ${cx - 14} ${endY - 55}
           L ${cx} ${endY - 35}
           L ${cx + 16} ${endY - 50}"
        fill="none"
        stroke="rgba(0,0,0,0.7)"
        stroke-width="4.5"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  `;
}

/**
 * Squiggly hand-drawn arrow pointing downward.
 * A loose, wiggly line with an arrowhead — adds playful energy.
 */
function squigglyArrowSvg(width: number, height: number): string {
  const cx = Math.round(width * 0.45);
  const startY = 15;
  const endY = height - 20;

  // Build a squiggly path with small oscillations
  const segments = 6;
  const segH = (endY - startY - 40) / segments;
  const wiggle = 25;

  let path = `M ${cx} ${startY}`;
  for (let i = 0; i < segments; i++) {
    const y1 = startY + segH * i + segH * 0.5;
    const y2 = startY + segH * (i + 1);
    const dir = i % 2 === 0 ? 1 : -1;
    path += ` Q ${cx + wiggle * dir} ${y1}, ${cx} ${y2}`;
  }

  return `
    <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
      <!-- Squiggly line -->
      <path
        d="${path}"
        fill="none"
        stroke="rgba(0,0,0,0.7)"
        stroke-width="4.5"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      <!-- Arrowhead -->
      <path
        d="M ${cx - 14} ${endY - 55}
           L ${cx} ${endY - 35}
           L ${cx + 14} ${endY - 55}"
        fill="none"
        stroke="rgba(0,0,0,0.7)"
        stroke-width="4"
        stroke-linecap="round"
        stroke-linejoin="round"
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

  // ── Add hand-drawn arrow (randomly: none / curved / squiggly) ──

  const arrowVariant = config.showArrow ? "curved" : pickArrowVariant();

  if (arrowVariant !== "none") {
    const arrowHeight = Math.round(height * 0.22);
    const arrowSvg = arrowVariant === "curved"
      ? curvedArrowSvg(Math.round(width * 0.3), arrowHeight)
      : squigglyArrowSvg(Math.round(width * 0.3), arrowHeight);

    const arrowBuffer = await sharp(Buffer.from(arrowSvg))
      .png()
      .toBuffer();

    // Position arrow below the text, centred-left
    imageBuffer = await sharp(imageBuffer)
      .composite([
        {
          input: arrowBuffer,
          top: Math.round(height * 0.68),
          left: Math.round(width * 0.15),
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
