/**
 * Image Prompt Enhancer
 *
 * Takes the descriptive imagePrompt from content generation (written for
 * humans to understand) and rewrites it as a technically precise Flux 1.1 Pro
 * prompt — specifying lighting rigs, camera angles, material descriptions,
 * render quality flags, and negative constraints.
 *
 * This is the same two-step process Manus uses internally, which is why
 * Manus images look better than a direct prompt-to-model call.
 *
 * Uses claude-3-5-haiku for speed (prompt engineering doesn't need Sonnet).
 * Adds ~1–2 seconds to image generation, saves minutes vs Manus.
 */

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ENHANCEMENT_MODEL = "claude-3-5-haiku-20241022";

const SYSTEM_PROMPT = `You are an expert image generation prompt engineer specialising in Flux 1.1 Pro and Pixar-style 3D illustration.

Your job: take a rough image concept written in plain English and rewrite it as a technically precise, production-grade Flux prompt that reliably produces cinematic-quality results.

For Pixar / 3D illustration style, a great Flux prompt:

STYLE LINE (always first):
"Pixar 3D animated film style, high-quality CGI render, 2024 Disney-Pixar animation quality, studio-grade render"

SCENE DETAILS:
- Name every significant object with size, position relative to frame, material, and colour
- Use scale contrast for impact: "a tiny [character] next to a giant [object]"
- Healthcare/business setting unless otherwise specified
- Describe foreground, midground, and background elements

LIGHTING (be specific):
- "warm golden key light from upper-left, soft fill light from right, subtle blue rim light from behind"
- "ambient occlusion on all contact surfaces, soft shadows, volumetric light rays if appropriate"

CAMERA / COMPOSITION:
- Specify shot type: "medium shot" / "close-up" / "wide establishing shot"
- Camera angle: "slight low angle" / "eye level" / "bird's eye"
- Composition: "rule-of-thirds, subject at left third" / "centred symmetrical"
- Depth of field: "shallow depth of field, subject in sharp focus, background softly blurred"

MOOD / PALETTE:
- Name the colour palette: "warm amber and cream tones" / "cool clinical blues and whites"
- Emotional tone: "optimistic and professional" / "tense and urgent" / "calm and reflective"

TECHNICAL QUALITY (always end with):
"ultra-detailed surface textures, subsurface scattering on skin, 8K render quality, sharp focus"

NEGATIVE CONSTRAINTS (always last line):
"No text, no logos, no watermarks, no real people, no brand marks, no UI elements"

OUTPUT RULES:
- Return ONLY the enhanced prompt. No explanation, no preamble, no markdown, no labels.
- The prompt should be 150–300 words.
- Do not use bullet points or line breaks in the output — write it as continuous prose separated by commas.
- Never include the word "Generate" or "Create" — start directly with the style descriptor.`;

/**
 * Editorial photography, for blogs and articles (25 Sept 2026). The Pixar
 * prompt above opens every prompt with a Pixar style line, so a blog's
 * hero came out as a 3D render whatever the writer asked for. The website
 * wants text-free editorial photography for a blog's hero and share card.
 */
const EDITORIAL_SYSTEM_PROMPT = `You are an expert image prompt engineer for Flux 1.1 Pro, specialising in photorealistic editorial photography for a healthcare commercial audience.

Rewrite the rough concept as a precise photographic prompt.

STYLE LINE (always first):
"Photorealistic editorial photograph, documentary style, natural light, shot on a 35mm full-frame camera"

SCENE: a real healthcare or business setting (a hospital corridor, a procurement meeting room, a clinic reception, a conference hall). Name the key objects, their materials and where they sit in the frame. Prefer environments and objects over people; any people are anonymous, seen from behind, out of focus or at a distance.

LIGHT AND CAMERA: name the light source and quality, the lens (for example 35mm or 50mm), the angle and the depth of field. Calm, credible composition with space to breathe.

PALETTE AND MOOD: muted, natural colour; understated and observational, never glossy advertising.

NEGATIVE CONSTRAINTS (always last line):
"No text, no lettering, no numbers, no signage, no logos, no watermarks, no UI, no 3D render, no illustration, no cartoon, no recognisable real people"

OUTPUT RULES: return ONLY the prompt, 120 to 250 words, continuous prose separated by commas, no preamble, never starting with "Generate" or "Create".`;

/** Styles that take the editorial photography prompt rather than the Pixar one. */
export function isEditorialStyle(style: string | undefined): boolean {
  if (!style) return false;
  return style === "editorial_photography" || style === "lifestyle_photography" || style === "real_photo"
    || /^(cover|hero|header)_image_prompt$/.test(style) || /^in_article_image_prompt(_\d+)?$/.test(style);
}

export async function enhanceImagePrompt(
  rawPrompt: string,
  style: string | undefined,
  anthropicApiKey: string
): Promise<string> {
  const styleNote = style && style !== "vivid" && style !== "natural"
    ? ` Style context: ${style}.`
    : "";

  const userMessage = `Rewrite this image concept as a production-grade Flux 1.1 Pro prompt:

"${rawPrompt}"${styleNote}

Remember: output ONLY the enhanced prompt, nothing else.`;

  try {
    const res = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": anthropicApiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: ENHANCEMENT_MODEL,
        max_tokens: 600,
        system: isEditorialStyle(style) ? EDITORIAL_SYSTEM_PROMPT : SYSTEM_PROMPT,
        messages: [{ role: "user", content: userMessage }],
      }),
    });

    if (!res.ok) {
      // Enhancement failed — return raw prompt so generation still proceeds
      console.warn(`Prompt enhancement failed (${res.status}) — using raw prompt`);
      return rawPrompt;
    }

    const data = await res.json();
    const enhanced = data.content?.[0]?.text?.trim();

    if (!enhanced || enhanced.length < 50) {
      return rawPrompt;
    }

    return enhanced;
  } catch {
    // Never block image generation due to enhancement failure
    console.warn("Prompt enhancement threw — using raw prompt");
    return rawPrompt;
  }
}
