import { generateText } from "@/lib/providers/content-generation/generate-text";
import {
  buildHospitalityPrompt,
  composePost,
  findUnsupportedFigures,
  firstLine,
  normaliseHashtags,
  parseHospitalityJson,
  sanitiseCaption,
  wordCount,
  type PromptInput,
} from "./prompts";

export interface GeneratedHospitalityPost {
  /** Caption followed by the hashtag block: what is stored and exported. */
  body: string;
  caption: string;
  hashtags: string[];
  altText: string;
  /** Things the person should check before approving. Empty when clean. */
  warnings: string[];
  provider: string;
}

type TextGenerator = typeof generateText;

/** The shape the writer must return, enforced by the API where the provider supports it. */
const HOSPITALITY_POST_SCHEMA = {
  type: "object",
  properties: {
    caption: { type: "string" },
    hashtags: { type: "array", items: { type: "string" } },
    alt_text: { type: "string" },
  },
  required: ["caption", "hashtags", "alt_text"],
  additionalProperties: false,
};

/**
 * One post, written and checked. If the writer states a figure that was not
 * in the brief or the forecast, it is asked once more to remove it; if the
 * figure persists the post is returned with a warning rather than hidden.
 */
export async function generateHospitalityPost(
  input: PromptInput & { companyId: string },
  generator: TextGenerator = generateText
): Promise<GeneratedHospitalityPost> {
  const { system, user } = buildHospitalityPrompt(input);
  const supplied = [input.brief, input.forecastFacts, input.company.settings.venue_notes, input.dateLabel].filter(Boolean).join("\n");
  const allowEmoji = input.company.settings.allow_emoji === true;
  const min = input.postType.generation.minWords ?? 30;
  const max = input.postType.generation.maxWords ?? 90;

  let attemptUser = user;
  let last: { parsed: ReturnType<typeof parseHospitalityJson>; caption: string; provider: string } | null = null;
  let unsupported: string[] = [];

  for (let attempt = 0; attempt < 2; attempt++) {
    const result = await generator({ companyId: input.companyId, systemPrompt: system, userPrompt: attemptUser, maxTokens: 700, temperature: 0.6, geminiModel: "gemini-2.5-flash", jsonSchema: HOSPITALITY_POST_SCHEMA, effort: "medium" });
    let parsed;
    try {
      parsed = parseHospitalityJson(result.text);
    } catch (err) {
      if (attempt === 1) throw err;
      attemptUser = `${user}\n\nYour last reply was not valid JSON. Reply with the JSON object only.`;
      continue;
    }
    const caption = sanitiseCaption(parsed.caption, allowEmoji);
    unsupported = findUnsupportedFigures(caption, supplied);
    last = { parsed, caption, provider: result.provider };
    if (unsupported.length === 0) break;
    attemptUser = `${user}\n\nYour last post stated ${unsupported.join(", ")}, which was not supplied. Rewrite it without those figures or anything else that was not supplied.`;
  }
  if (!last) throw new Error("The writer returned nothing usable");

  const hashtags = normaliseHashtags(last.parsed.hashtags, input.company.settings.standing_hashtags);
  const warnings: string[] = [];
  if (unsupported.length > 0) {
    warnings.push(`Please check ${unsupported.join(", ")}: ${unsupported.length === 1 ? "it was" : "they were"} not in what you gave us.`);
  }
  const words = wordCount(last.caption);
  if (words > max * 1.3 || words < min * 0.5) warnings.push(`The post is ${words} words, a little off the usual ${min} to ${max}.`);
  // A letter glued to a number ("a335" for £35, live check 14 Oct 2026) is a
  // model slip the figure check cannot see, because the digits are not a
  // word on their own. Flag it for the person to read before approving.
  const glued = last.caption.match(/\b[a-z]{1,2}\d{2,}\b/gi) || [];
  if (glued.length > 0) warnings.push(`Please check ${glued.join(", ")}: it looks like a price or number written wrongly.`);
  if (firstLine(last.caption).length > 110) warnings.push("The first line is long. Instagram only shows the start of it before 'more'.");

  return {
    body: composePost(last.caption, hashtags),
    caption: last.caption,
    hashtags,
    altText: last.parsed.altText,
    warnings,
    provider: last.provider,
  };
}
