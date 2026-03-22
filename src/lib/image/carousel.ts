/**
 * Programmatic Carousel Slide Generator
 *
 * Generates carousel slides server-side using Satori (JSX → SVG) + Sharp (SVG → PNG).
 * Same stack as the quote card generator — perfect text rendering, zero AI cost.
 *
 * Slide types:
 *
 * COVER SLIDE:
 * ┌──────────────────────────────────┐
 * │  ● Profile  Follow Name         │
 * │                                  │
 * │       Title text in bold         │
 * │       across two lines           │
 * │                                  │
 * │       Subtitle in lighter text   │
 * │                                  │
 * │       Swipe →                    │
 * │                        LOGO      │
 * └──────────────────────────────────┘
 *
 * CONTENT SLIDE:
 * ┌──────────────────────────────────┐
 * │                                  │
 * │  01                              │  ← Oversized accent number
 * │                                  │
 * │  Heading text                    │  ← Bold, dark
 * │                                  │
 * │  Body text explaining the point  │  ← Regular weight, grey
 * │  in a paragraph or two           │
 * │                                  │
 * │                                  │
 * │  ● ● ● ●                  2/5   │  ← Dot indicators + page
 * └──────────────────────────────────┘
 *
 * CTA SLIDE:
 * ┌──────────────────────────────────┐
 * │                                  │
 * │  Want to learn more?             │
 * │                                  │
 * │  ┌─────────────────────────┐     │
 * │  │  Follow Name for more  →│     │  ← CTA button
 * │  └─────────────────────────┘     │
 * │                                  │
 * │                        LOGO      │
 * └──────────────────────────────────┘
 */

import sharp from "sharp";
import satori from "satori";
import React from "react";
import { readFileSync } from "fs";
import { join } from "path";

// ============================================================
// Types
// ============================================================

export interface CarouselSlide {
  type: "cover" | "content" | "cta";
  /** Slide number for content slides (1-based) */
  slideNumber?: number;
  /** Total content slides (for "2/5" indicator) */
  totalSlides?: number;
  /** Title/heading text */
  title: string;
  /** Body/subtitle text */
  body?: string;
}

export interface CarouselConfig {
  /** The slides to generate */
  slides: CarouselSlide[];
  /** Accent colour as hex (e.g. "#A27BF9") */
  accentColor: string;
  /** Background colour (default white) */
  bgColor?: string;
  /** Spokesperson profile picture URL */
  profilePicUrl?: string | null;
  /** Spokesperson display name */
  profileName?: string | null;
  /** Company logo URL */
  logoUrl?: string | null;
  /** Company name fallback */
  companyName?: string | null;
  /** Output size in pixels (default 1080x1080) */
  size?: number;
}

export interface CarouselResult {
  /** Array of generated slide images */
  slides: {
    buffer: Buffer;
    mimeType: string;
    slideIndex: number;
  }[];
  /** Total slides generated */
  count: number;
  width: number;
  height: number;
}

// ============================================================
// Font loading (shared cache with quote-card.ts)
// ============================================================

let _fontRegularCache: ArrayBuffer | null = null;
let _fontBoldCache: ArrayBuffer | null = null;

function getFontBold(): ArrayBuffer {
  if (_fontBoldCache) return _fontBoldCache;
  const fontPath = join(process.cwd(), "src/lib/image/fonts/Poppins-SemiBold.ttf");
  const buffer = readFileSync(fontPath);
  _fontBoldCache = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  return _fontBoldCache;
}

function getFontRegular(): ArrayBuffer {
  if (_fontRegularCache) return _fontRegularCache;
  // Try Poppins-Regular first, fall back to SemiBold if not available
  try {
    const fontPath = join(process.cwd(), "src/lib/image/fonts/Poppins-Regular.ttf");
    const buffer = readFileSync(fontPath);
    _fontRegularCache = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  } catch {
    // Fall back to SemiBold
    _fontRegularCache = getFontBold();
  }
  return _fontRegularCache;
}

// ============================================================
// Slide renderers
// ============================================================

function renderCoverSlide(
  slide: CarouselSlide,
  config: CarouselConfig,
  size: number
): React.ReactElement {
  const margin = Math.round(size * 0.08);
  const profileSize = Math.round(size * 0.05);

  return React.createElement(
    "div",
    {
      style: {
        display: "flex",
        flexDirection: "column",
        width: size,
        height: size,
        backgroundColor: config.bgColor || "#FFFFFF",
        position: "relative",
        padding: margin,
      },
    },
    // Profile (top-left)
    config.profileName
      ? React.createElement(
          "div",
          {
            style: {
              display: "flex",
              flexDirection: "row",
              alignItems: "center",
              marginBottom: Math.round(size * 0.04),
            },
          },
          config.profilePicUrl
            ? React.createElement("img", {
                src: config.profilePicUrl,
                width: profileSize,
                height: profileSize,
                style: { borderRadius: "50%", objectFit: "cover", marginRight: 12 },
              })
            : React.createElement("div", {
                style: {
                  width: profileSize,
                  height: profileSize,
                  borderRadius: "50%",
                  backgroundColor: config.accentColor + "30",
                  marginRight: 12,
                },
              }),
          React.createElement(
            "div",
            {
              style: {
                display: "flex",
                flexDirection: "column",
                fontSize: Math.round(size * 0.016),
                color: "#6B7280",
                fontFamily: "Poppins",
              },
            },
            React.createElement("span", { style: { opacity: 0.7 } }, "Follow"),
            React.createElement(
              "span",
              { style: { fontWeight: 700, color: "#1F2937" } },
              config.profileName
            )
          )
        )
      : null,
    // Main title area (centred vertically)
    React.createElement(
      "div",
      {
        style: {
          display: "flex",
          flexDirection: "column",
          flex: 1,
          justifyContent: "center",
          alignItems: "flex-start",
        },
      },
      // Accent line
      React.createElement("div", {
        style: {
          width: Math.round(size * 0.06),
          height: 4,
          backgroundColor: config.accentColor,
          borderRadius: 2,
          marginBottom: Math.round(size * 0.03),
        },
      }),
      // Title
      React.createElement(
        "div",
        {
          style: {
            fontSize: Math.round(size * 0.045),
            fontFamily: "Poppins",
            fontWeight: 700,
            color: "#111827",
            lineHeight: 1.3,
            maxWidth: "85%",
          },
        },
        slide.title
      ),
      // Subtitle
      slide.body
        ? React.createElement(
            "div",
            {
              style: {
                fontSize: Math.round(size * 0.022),
                fontFamily: "Poppins",
                fontWeight: 400,
                color: "#6B7280",
                lineHeight: 1.5,
                marginTop: Math.round(size * 0.02),
                maxWidth: "80%",
              },
            },
            slide.body
          )
        : null,
      // "Swipe →" indicator
      React.createElement(
        "div",
        {
          style: {
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginTop: Math.round(size * 0.04),
            fontSize: Math.round(size * 0.016),
            fontFamily: "Poppins",
            fontWeight: 600,
            color: config.accentColor,
          },
        },
        "Swipe \u2192"
      )
    ),
    // Logo (bottom-right)
    config.logoUrl
      ? React.createElement("img", {
          src: config.logoUrl,
          height: Math.round(size * 0.035),
          style: {
            position: "absolute",
            bottom: margin,
            right: margin,
            opacity: 0.8,
          },
        })
      : config.companyName
      ? React.createElement(
          "div",
          {
            style: {
              position: "absolute",
              bottom: margin,
              right: margin,
              fontSize: Math.round(size * 0.016),
              fontFamily: "Poppins",
              fontWeight: 600,
              color: "#9CA3AF",
              letterSpacing: 2,
            },
          },
          config.companyName.toUpperCase()
        )
      : null
  );
}

function renderContentSlide(
  slide: CarouselSlide,
  config: CarouselConfig,
  size: number
): React.ReactElement {
  const margin = Math.round(size * 0.08);
  const slideNum = slide.slideNumber || 1;
  const totalSlides = slide.totalSlides || 1;

  // Dot indicators
  const dots: React.ReactElement[] = [];
  for (let i = 1; i <= totalSlides; i++) {
    dots.push(
      React.createElement("div", {
        key: i,
        style: {
          width: i === slideNum ? 24 : 8,
          height: 8,
          borderRadius: 4,
          backgroundColor: i === slideNum ? config.accentColor : "#E5E7EB",
        },
      })
    );
  }

  return React.createElement(
    "div",
    {
      style: {
        display: "flex",
        flexDirection: "column",
        width: size,
        height: size,
        backgroundColor: config.bgColor || "#FFFFFF",
        position: "relative",
        padding: margin,
      },
    },
    // Oversized number
    React.createElement(
      "div",
      {
        style: {
          fontSize: Math.round(size * 0.1),
          fontFamily: "Poppins",
          fontWeight: 700,
          color: config.accentColor,
          lineHeight: 1,
          opacity: 0.9,
        },
      },
      String(slideNum).padStart(2, "0")
    ),
    // Content area
    React.createElement(
      "div",
      {
        style: {
          display: "flex",
          flexDirection: "column",
          flex: 1,
          justifyContent: "center",
          marginTop: Math.round(size * -0.02),
        },
      },
      // Heading
      React.createElement(
        "div",
        {
          style: {
            fontSize: Math.round(size * 0.035),
            fontFamily: "Poppins",
            fontWeight: 700,
            color: "#111827",
            lineHeight: 1.3,
            maxWidth: "90%",
          },
        },
        slide.title
      ),
      // Body
      slide.body
        ? React.createElement(
            "div",
            {
              style: {
                fontSize: Math.round(size * 0.02),
                fontFamily: "Poppins",
                fontWeight: 400,
                color: "#6B7280",
                lineHeight: 1.6,
                marginTop: Math.round(size * 0.025),
                maxWidth: "85%",
              },
            },
            slide.body
          )
        : null
    ),
    // Bottom bar: dots + page number
    React.createElement(
      "div",
      {
        style: {
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        },
      },
      React.createElement(
        "div",
        { style: { display: "flex", gap: 6 } },
        ...dots
      ),
      React.createElement(
        "div",
        {
          style: {
            fontSize: Math.round(size * 0.014),
            fontFamily: "Poppins",
            fontWeight: 600,
            color: "#9CA3AF",
          },
        },
        `${slideNum}/${totalSlides}`
      )
    )
  );
}

function renderCtaSlide(
  slide: CarouselSlide,
  config: CarouselConfig,
  size: number
): React.ReactElement {
  const margin = Math.round(size * 0.08);

  return React.createElement(
    "div",
    {
      style: {
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        width: size,
        height: size,
        backgroundColor: config.bgColor || "#FFFFFF",
        position: "relative",
        padding: margin,
      },
    },
    // Accent line
    React.createElement("div", {
      style: {
        width: Math.round(size * 0.06),
        height: 4,
        backgroundColor: config.accentColor,
        borderRadius: 2,
        marginBottom: Math.round(size * 0.04),
      },
    }),
    // CTA text
    React.createElement(
      "div",
      {
        style: {
          fontSize: Math.round(size * 0.035),
          fontFamily: "Poppins",
          fontWeight: 700,
          color: "#111827",
          textAlign: "center",
          lineHeight: 1.3,
          maxWidth: "80%",
        },
      },
      slide.title
    ),
    // Subtitle
    slide.body
      ? React.createElement(
          "div",
          {
            style: {
              fontSize: Math.round(size * 0.02),
              fontFamily: "Poppins",
              fontWeight: 400,
              color: "#6B7280",
              textAlign: "center",
              marginTop: Math.round(size * 0.02),
              maxWidth: "70%",
            },
          },
          slide.body
        )
      : null,
    // CTA button
    config.profileName
      ? React.createElement(
          "div",
          {
            style: {
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              marginTop: Math.round(size * 0.05),
              backgroundColor: config.accentColor,
              color: "#FFFFFF",
              fontSize: Math.round(size * 0.02),
              fontFamily: "Poppins",
              fontWeight: 600,
              paddingLeft: Math.round(size * 0.04),
              paddingRight: Math.round(size * 0.04),
              paddingTop: Math.round(size * 0.015),
              paddingBottom: Math.round(size * 0.015),
              borderRadius: Math.round(size * 0.01),
            },
          },
          `Follow ${config.profileName} \u2192`
        )
      : null,
    // Logo (bottom-right)
    config.logoUrl
      ? React.createElement("img", {
          src: config.logoUrl,
          height: Math.round(size * 0.035),
          style: {
            position: "absolute",
            bottom: margin,
            right: margin,
            opacity: 0.8,
          },
        })
      : config.companyName
      ? React.createElement(
          "div",
          {
            style: {
              position: "absolute",
              bottom: margin,
              right: margin,
              fontSize: Math.round(size * 0.016),
              fontFamily: "Poppins",
              fontWeight: 600,
              color: "#9CA3AF",
              letterSpacing: 2,
            },
          },
          config.companyName.toUpperCase()
        )
      : null
  );
}

// ============================================================
// Main generator
// ============================================================

export async function generateCarousel(config: CarouselConfig): Promise<CarouselResult> {
  const size = config.size || 1080;
  const fontBold = getFontBold();
  const fontRegular = getFontRegular();

  const fonts = [
    { name: "Poppins", data: fontBold, weight: 700 as const, style: "normal" as const },
    { name: "Poppins", data: fontRegular, weight: 400 as const, style: "normal" as const },
  ];

  const results: CarouselResult["slides"] = [];

  for (let i = 0; i < config.slides.length; i++) {
    const slide = config.slides[i];
    let element: React.ReactElement;

    switch (slide.type) {
      case "cover":
        element = renderCoverSlide(slide, config, size);
        break;
      case "cta":
        element = renderCtaSlide(slide, config, size);
        break;
      default:
        element = renderContentSlide(slide, config, size);
        break;
    }

    const svg = await satori(element, { width: size, height: size, fonts });
    const buffer = await sharp(Buffer.from(svg)).png().toBuffer();

    results.push({
      buffer,
      mimeType: "image/png",
      slideIndex: i,
    });
  }

  return {
    slides: results,
    count: results.length,
    width: size,
    height: size,
  };
}
