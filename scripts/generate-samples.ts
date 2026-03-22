/**
 * Generate static sample images for post type previews.
 * Run once: npx tsx scripts/generate-samples.ts
 */

import { generateQuoteCard } from "../src/lib/image/quote-card";
import { generateCarousel } from "../src/lib/image/carousel";
import { writeFileSync } from "fs";
import { join } from "path";

const OUT = join(process.cwd(), "public/samples");

async function main() {
  console.log("Generating sample images...");

  // 1. Quote Card (green) — Problem Diagnosis
  const quoteGreen = await generateQuoteCard({
    text: "Nobody talks about this.",
    color: "#8AB80A",
    postType: "insight",
    width: 400,
    height: 400,
  });
  writeFileSync(join(OUT, "quote-card-green.png"), quoteGreen.buffer);
  console.log("✓ Quote card (green)");

  // 2. Quote Card (purple + arrow) — Expert Perspective
  const quotePurple = await generateQuoteCard({
    text: "If I was in your role.",
    color: "#7C3AED",
    postType: "if_i_was",
    showArrow: true,
    width: 400,
    height: 400,
  });
  writeFileSync(join(OUT, "quote-card-purple.png"), quotePurple.buffer);
  console.log("✓ Quote card (purple + arrow)");

  // 3. Quote Card (blue) — Contrarian Take
  const quoteBlue = await generateQuoteCard({
    text: "Your competitor knows this.",
    color: "#0EA5E9",
    postType: "contrarian",
    width: 400,
    height: 400,
  });
  writeFileSync(join(OUT, "quote-card-blue.png"), quoteBlue.buffer);
  console.log("✓ Quote card (blue)");

  // 4. Quote Card (emerald) — Article Teaser
  const quoteEmerald = await generateQuoteCard({
    text: "We wrote about this.",
    color: "#059669",
    postType: "blog_teaser",
    width: 400,
    height: 400,
  });
  writeFileSync(join(OUT, "quote-card-emerald.png"), quoteEmerald.buffer);
  console.log("✓ Quote card (emerald)");

  // 5. Carousel — Tactical How-To
  const carousel = await generateCarousel({
    slides: [
      { type: "cover", title: "5 Steps to Better Results", body: "A quick framework" },
      { type: "content", slideNumber: 1, totalSlides: 3, title: "Start with the problem", body: "Define what you are solving before you build anything." },
      { type: "content", slideNumber: 2, totalSlides: 3, title: "Test with real users", body: "Get feedback early. Do not wait for perfection." },
      { type: "cta", title: "Want more?", body: "Follow for weekly insights." },
    ],
    accentColor: "#7C3AED",
    profileName: "Your Name",
    companyName: "AGENCY",
    size: 400,
  });
  // Save cover slide as the preview
  writeFileSync(join(OUT, "carousel-cover.png"), carousel.slides[0].buffer);
  console.log("✓ Carousel cover");

  console.log("\nDone! Samples saved to public/samples/");
  console.log("For Pixar 3D, Editorial Photo, and Scene Quote — use placeholder images.");
}

main().catch(console.error);
