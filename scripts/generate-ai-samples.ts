/**
 * Generate AI sample images for post type previews.
 * Requires API keys in .env.local
 * Run: npx tsx scripts/generate-ai-samples.ts
 */

import { writeFileSync } from "fs";
import { join } from "path";
import sharp from "sharp";

const OUT = join(process.cwd(), "public/samples");

async function generatePixarSample() {
  const apiKey = process.env.FAL_KEY || process.env.FAL_API_KEY;
  if (!apiKey) {
    console.log("⚠ No FAL_KEY — skipping Pixar sample");
    return;
  }

  console.log("Generating Pixar 3D sample...");
  const res = await fetch("https://fal.run/fal-ai/flux-pro/v1.1", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Key ${apiKey}`,
    },
    body: JSON.stringify({
      prompt: "Pixar/Disney-adjacent 3D rendered scene of a professional businessperson in a modern office, sitting at a desk with a laptop, warm cinematic lighting, slightly exaggerated proportions, depth of field, detailed environment. No text.",
      image_size: { width: 512, height: 512 },
      num_images: 1,
    }),
  });

  if (!res.ok) {
    console.error("Pixar generation failed:", await res.text());
    return;
  }

  const data = await res.json();
  if (data.images && data.images[0]) {
    const imgRes = await fetch(data.images[0].url);
    const buffer = Buffer.from(await imgRes.arrayBuffer());
    // Resize to 400x400 for consistency
    const resized = await sharp(buffer).resize(400, 400, { fit: "cover" }).png().toBuffer();
    writeFileSync(join(OUT, "pixar-3d.png"), resized);
    console.log("✓ Pixar 3D sample");
  }
}

async function generateEditorialSample() {
  const apiKey = process.env.GOOGLE_GEMINI_API_KEY;
  if (!apiKey) {
    console.log("⚠ No GOOGLE_GEMINI_API_KEY — skipping editorial sample");
    return;
  }

  console.log("Generating editorial photo sample...");
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-002:predict?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        instances: [{ prompt: "Candid editorial photography of a person walking through a park on a sunny morning, warm golden tones, shot on 35mm film, shallow depth of field, authentic and unposed lifestyle moment. No text." }],
        parameters: { sampleCount: 1, aspectRatio: "1:1" },
      }),
    }
  );

  if (!res.ok) {
    console.error("Editorial generation failed:", await res.text());
    return;
  }

  const data = await res.json();
  if (data.predictions && data.predictions[0]?.bytesBase64Encoded) {
    const buffer = Buffer.from(data.predictions[0].bytesBase64Encoded, "base64");
    const resized = await sharp(buffer).resize(400, 400, { fit: "cover" }).png().toBuffer();
    writeFileSync(join(OUT, "editorial-photo.png"), resized);
    console.log("✓ Editorial photo sample");
  }
}

async function generateSceneQuoteSample() {
  const apiKey = process.env.GOOGLE_GEMINI_API_KEY;
  if (!apiKey) {
    console.log("⚠ No GOOGLE_GEMINI_API_KEY — skipping scene quote sample");
    return;
  }

  console.log("Generating scene quote background...");
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-002:predict?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        instances: [{ prompt: "A large whiteboard in a modern office with warm lighting. The whiteboard is mostly blank in the centre, with faint erased marker traces. Blurred office background with plants and glass walls. Realistic photography." }],
        parameters: { sampleCount: 1, aspectRatio: "1:1" },
      }),
    }
  );

  if (!res.ok) {
    console.error("Scene quote generation failed:", await res.text());
    return;
  }

  const data = await res.json();
  if (data.predictions && data.predictions[0]?.bytesBase64Encoded) {
    const bgBuffer = Buffer.from(data.predictions[0].bytesBase64Encoded, "base64");

    // Composite text on top using the scene quote generator
    const { generateSceneQuote } = await import("../src/lib/image/scene-quote");
    const result = await generateSceneQuote({
      text: "We got this completely wrong.",
      backgroundImage: bgBuffer,
      width: 400,
      height: 400,
    });
    writeFileSync(join(OUT, "scene-quote.png"), result.buffer);
    console.log("✓ Scene quote sample");
  }
}

async function main() {
  await generatePixarSample();
  await generateEditorialSample();
  await generateSceneQuoteSample();
  console.log("\nDone!");
}

main().catch(console.error);
