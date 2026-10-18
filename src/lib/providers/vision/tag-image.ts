/** One structured vision call for photo or video frames, using company writing policy. */
import { autoTagPrompt, parseAutoTagJson, type ParsedTags } from "@/lib/media/vocabulary";
import { requestText, resolveTextConfig, sharedTextConfig, type TextProvider } from "../text-runtime";
export interface VisionImage {
  mimeType: "image/jpeg" | "image/png" | "image/webp";
  base64: string;
}
const AUTO_TAG_SCHEMA = {
  type: "object",
  properties: {
    weather: { type: "array", items: { type: "string" } },
    place: { type: "array", items: { type: "string" } },
    subject: { type: "array", items: { type: "string" } },
    time_of_day: { type: "array", items: { type: "string" } },
    people_present: { type: "boolean" },
    text_space: { type: "boolean" },
    scene: { type: "string" },
  },
  required: ["weather", "place", "subject", "time_of_day", "people_present", "text_space", "scene"],
  additionalProperties: false,
};
export function geminiKey(env: Partial<NodeJS.ProcessEnv> = process.env): string | undefined { return env.GOOGLE_GEMINI_API_KEY; }
export function anthropicKey(env: Partial<NodeJS.ProcessEnv> = process.env): string | undefined { return env.ANTHROPIC_API_KEY; }
export async function tagImages(images: VisionImage[], options: { venueContext?: string | null; companyId?: string; fetcher?: typeof fetch; env?: Partial<NodeJS.ProcessEnv> } = {}): Promise<ParsedTags & { provider: TextProvider }> {
  if (!images.length) throw new Error("No image to tag");
  const config = options.companyId ? await resolveTextConfig(options.companyId) : options.env ? sharedTextConfig(options.env) : await resolveTextConfig();
  const result = await requestText(config, {
    systemPrompt: "Classify the images using only the agreed vocabulary.",
    userPrompt: autoTagPrompt(options.venueContext ?? null),
    images, task: "classification", jsonSchema: AUTO_TAG_SCHEMA, maxTokens: 1000,
  }, options.fetcher);
  return { ...parseAutoTagJson(result.text), provider: result.provider };
}
