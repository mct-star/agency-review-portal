/**
 * Scene Quote Generator
 *
 * Creates images where hook text appears IN a real-world scene:
 * - Written on a whiteboard in a hospital corridor
 * - Displayed on a billboard in a city
 * - Chalked on a blackboard in a boardroom
 * - Written on a post-it note on a desk
 * - Projected on a screen in a conference room
 *
 * Two-step process:
 * 1. Gemini generates the background scene with a blank surface
 * 2. Satori+Sharp composites the hook text on top
 *
 * The scene context adapts to the company's industry:
 * - Healthcare: hospital whiteboard, clinic waiting room screen
 * - Fintech: trading floor display, bank lobby screen
 * - Construction: site office whiteboard, project board
 * - Generic: coffee shop chalkboard, office post-it, city billboard
 */

import sharp from "sharp";
import satori from "satori";
import React from "react";
import { readFileSync } from "fs";
import { join } from "path";
import { ensureVibrantColor } from "./quote-card";

// ============================================================
// Types
// ============================================================

export interface SceneQuoteConfig {
  /** The hook text to overlay */
  text: string;
  /** The background scene image (Buffer or URL) */
  backgroundImage: Buffer;
  /** Accent colour for any decorative elements */
  accentColor?: string;
  /** Output dimensions */
  width?: number;
  height?: number;
}

export interface SceneQuoteResult {
  buffer: Buffer;
  mimeType: string;
  width: number;
  height: number;
}

// ============================================================
// Scene prompt templates by industry
// ============================================================

export function getScenePrompt(industry?: string, topic?: string): string {
  const topicHint = topic ? ` The scene should subtly relate to: ${topic.slice(0, 80)}.` : "";

  if (industry?.toLowerCase().includes("healthcare") || industry?.toLowerCase().includes("medical") || industry?.toLowerCase().includes("pharma")) {
    const scenes = [
      `A large whiteboard in a modern hospital corridor, partially erased with faint marker traces. The whiteboard is mostly blank in the centre, ready for text. Blurred hospital background with warm fluorescent lighting. Realistic photography.${topicHint}`,
      `A frosted glass partition in a modern medical office with a clean area in the centre. Soft natural light from windows. Stethoscope and medical charts visible but out of focus in the background. Editorial photography.${topicHint}`,
      `A clean conference room screen in a hospital boardroom. The screen displays a plain dark background, ready for text. Modern medical facility, warm lighting, blurred chairs and table.${topicHint}`,
    ];
    return scenes[Math.floor(Math.random() * scenes.length)];
  }

  if (industry?.toLowerCase().includes("fintech") || industry?.toLowerCase().includes("finance") || industry?.toLowerCase().includes("banking")) {
    const scenes = [
      `A large digital display board in a modern financial trading floor. The screen shows a plain dark background, ready for text. Blurred trading screens and city skyline visible through windows. Cool blue lighting.${topicHint}`,
      `A glass-walled meeting room in a modern bank headquarters. A large whiteboard with a clean centre area. City skyline visible through floor-to-ceiling windows. Professional, minimal.${topicHint}`,
    ];
    return scenes[Math.floor(Math.random() * scenes.length)];
  }

  if (industry?.toLowerCase().includes("construction") || industry?.toLowerCase().includes("property") || industry?.toLowerCase().includes("building")) {
    const scenes = [
      `A project planning whiteboard in a construction site office. Hard hats and high-vis vests visible on hooks. The whiteboard has a clean centre area ready for text. Industrial lighting, realistic.${topicHint}`,
      `A large site noticeboard at a construction project entrance. The board has a clean centre section. Cranes and scaffolding visible in the background. Overcast sky, editorial photography.${topicHint}`,
    ];
    return scenes[Math.floor(Math.random() * scenes.length)];
  }

  // Generic / default scenes
  const scenes = [
    `A large chalkboard in a trendy coffee shop. The chalkboard has a clean centre area ready for text. Warm ambient lighting, coffee cups and plants in the soft background. Cosy, editorial photography.${topicHint}`,
    `A city billboard on a building wall, mostly blank with a clean centre area. Urban street scene with pedestrians walking past, blurred. Golden hour lighting. Cinematic photography.${topicHint}`,
    `A large glass window with morning condensation. A finger has cleared a space in the centre of the misted glass. City or nature visible through the cleared area. Warm morning light. Artistic photography.${topicHint}`,
    `A modern office with a large post-it note wall. One oversized post-it in the centre is blank and ready for text. Other colourful post-its around it are blurred. Creative workspace, warm lighting.${topicHint}`,
  ];
  return scenes[Math.floor(Math.random() * scenes.length)];
}

// ============================================================
// Font loading
// ============================================================

let _fontCache: ArrayBuffer | null = null;
function getFont(): ArrayBuffer {
  if (_fontCache) return _fontCache;
  const fontPath = join(process.cwd(), "src/lib/image/fonts/Poppins-ExtraBold.ttf");
  const buffer = readFileSync(fontPath);
  _fontCache = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  return _fontCache;
}

// ============================================================
// Main generator
// ============================================================

export async function generateSceneQuote(config: SceneQuoteConfig): Promise<SceneQuoteResult> {
  const width = config.width || 1080;
  const height = config.height || 1080;
  const fontData = getFont();

  // Resize background to target dimensions
  const background = await sharp(config.backgroundImage)
    .resize(width, height, { fit: "cover" })
    .png()
    .toBuffer();

  // Calculate text size based on word count
  const words = config.text.split(/\s+/);
  let fontSize: number;
  if (words.length <= 4) {
    fontSize = Math.round(width * 0.07);
  } else if (words.length <= 8) {
    fontSize = Math.round(width * 0.055);
  } else {
    fontSize = Math.round(width * 0.045);
  }

  // Create text overlay with semi-transparent dark background
  const textOverlay = React.createElement(
    "div",
    {
      style: {
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        width,
        height,
        position: "relative",
      },
    },
    // Semi-transparent dark overlay for text readability
    React.createElement("div", {
      style: {
        position: "absolute",
        top: Math.round(height * 0.25),
        left: Math.round(width * 0.1),
        right: Math.round(width * 0.1),
        bottom: Math.round(height * 0.25),
        backgroundColor: "rgba(0,0,0,0.55)",
        borderRadius: 16,
      },
    }),
    // Text
    React.createElement(
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
          fontWeight: 800,
          lineHeight: 1.25,
          padding: Math.round(width * 0.12),
          zIndex: 1,
        },
      },
      config.text
    )
  );

  const textSvg = await satori(textOverlay, {
    width,
    height,
    fonts: [
      { name: "Poppins", data: fontData, weight: 800, style: "normal" as const },
    ],
  });

  const textBuffer = await sharp(Buffer.from(textSvg)).png().toBuffer();

  // Composite text over background
  const result = await sharp(background)
    .composite([{ input: textBuffer, blend: "over" }])
    .png()
    .toBuffer();

  return {
    buffer: result,
    mimeType: "image/png",
    width,
    height,
  };
}
