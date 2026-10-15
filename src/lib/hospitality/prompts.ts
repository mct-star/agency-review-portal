import { getPostType, type PostTypeOption } from "@/lib/constants/post-types";

/**
 * Writing for a hospitality venue's Facebook and Instagram.
 *
 * Everything here is pure: it builds the prompt and cleans the reply, and
 * the model call lives in generate.ts. The hard rule is that facts (a price,
 * a time, a date, a dish, an event) come only from what the person supplied
 * or from the forecast, never from the writer.
 */

export interface VenueSettings {
  /** Free text: what the venue is and where, in the owner's words. */
  venue_notes?: string;
  /** Hashtags to add to every post, for example "#SouthCerney". */
  standing_hashtags?: string[];
  allow_emoji?: boolean;
}

export interface PromptCompany {
  name: string;
  industry?: string | null;
  description?: string | null;
  settings: VenueSettings;
}

export interface PromptInput {
  company: PromptCompany;
  postType: PostTypeOption;
  /** What the person told us, in their own words. */
  brief: string;
  /** For the weather post: the forecast facts, already worded. */
  forecastFacts?: string | null;
  /** Today's date label, for example "Tuesday 14 October". */
  dateLabel?: string | null;
}

export function readSettings(raw: unknown): VenueSettings {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    venue_notes: typeof r.venue_notes === "string" ? r.venue_notes.slice(0, 1000) : undefined,
    standing_hashtags: Array.isArray(r.standing_hashtags)
      ? r.standing_hashtags.filter((t): t is string => typeof t === "string").slice(0, 8)
      : [],
    allow_emoji: r.allow_emoji === true,
  };
}

const SOURCE_BOUNDARY = `SOURCE BOUNDARY (non-negotiable)
- The only facts you may state are in the BRIEF, the FORECAST and the VENUE NOTES below.
- Never invent a price, a time, a date, an ingredient, a dish, a number of tables, an opening hour, an offer, a name or a place.
- If something a guest would need is missing (for example how to book), leave it out. Do not guess and do not write a placeholder.
- Do not claim awards, reviews, sourcing or provenance that are not stated below.`;

export function buildHospitalityPrompt(input: PromptInput): { system: string; user: string } {
  const { company, postType, brief } = input;
  const s = company.settings;
  const min = postType.generation.minWords ?? 30;
  const max = postType.generation.maxWords ?? 90;

  const system = [
    `You write Facebook and Instagram posts for ${company.name}, a hospitality venue. You write as the venue, like the funniest, warmest person behind the bar: quick, playful, a little cheeky, never smug.`,
    SOURCE_BOUNDARY,
    "VOICE (the part that makes people stop scrolling)",
    "- Entertain first, inform second. Every post earns a smile: a playful hook, a wry observation, a bit of wordplay, or a small joke about the situation everyone is in (the rain, Monday, the queue for the barbecue).",
    "- Find the angle, not the summary. 'Rainy day, come in' is the summary. 'The ducks are loving this. You may prefer a fire and a pint' is the angle.",
    "- Funny comes from the facts supplied and from ordinary life, never from invented facts. Never joke at a guest's expense, about anyone's appearance, or about anything sensitive.",
    "- One joke done well beats three. No stacked puns, no 'pun intended', no exclamation-mark enthusiasm, no clichés such as 'what better way to', 'look no further', 'treat yourself' or 'cosy vibes'.",
    "- Sound like a person talking, not an advert. Contractions are fine. Short sentences land jokes.",
    "STYLE",
    "- British English spelling and UK date style.",
    "- Prices are written as the pound sign followed by the number (£35) or as the number followed by the word pounds (35 pounds). Never any other symbol or letter before a price.",
    "- The first line is the hook. It must stand alone and make sense on its own, and it must be under 100 characters, because Instagram cuts the caption after about the first line.",
    "- Short lines and short paragraphs. No corporate or professional-network tone, no business-speak, no 'excited to announce', no 'delighted'.",
    "- No dashes used as punctuation (no long dashes). Use commas, full stops or a new line.",
    "- Do not use exclamation marks more than once.",
    s.allow_emoji
      ? "- At most two emoji in the whole post, and only where they add something."
      : "- Do not use emoji.",
    `- Length: between ${min} and ${max} words for the caption, hashtags not counted.`,
    "- Do not put hashtags in the caption. Return them separately.",
    "OUTPUT",
    'Return JSON only, with exactly these fields: {"caption": string, "hashtags": string[], "alt_text": string}',
    "- hashtags: three to five, each starting with #, about the content (food, weather, the kind of day). Use a place name as a hashtag only if it appears in the VENUE NOTES.",
    "- alt_text: one plain sentence describing the kind of photo that should go with the post, for a screen reader. Do not describe people.",
  ].join("\n");

  const lines = [
    postType.generation.contentInstructions || "",
    "",
    `VENUE NOTES: ${s.venue_notes?.trim() || [company.industry, company.description].filter(Boolean).join(". ") || "None given."}`,
    input.dateLabel ? `TODAY: ${input.dateLabel}` : "",
    input.forecastFacts ? `FORECAST (use only these figures): ${input.forecastFacts}` : "",
    `BRIEF: ${brief.trim() || "Nothing added."}`,
    "",
    "Write the post now.",
  ].filter((l) => l !== "");
  return { system, user: lines.join("\n") };
}

export interface ParsedPost {
  caption: string;
  hashtags: string[];
  altText: string;
}

/** Strict parse of the model's reply. Throws if it is not the agreed shape. */
export function parseHospitalityJson(text: string): ParsedPost {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  let raw: unknown;
  try {
    raw = JSON.parse(cleaned);
  } catch {
    // A model sometimes wraps the object in a sentence. The object itself is
    // still the answer, so take the outermost braces before giving up.
    const first = cleaned.indexOf("{");
    const last = cleaned.lastIndexOf("}");
    if (first < 0 || last <= first) throw new Error("The writer did not return JSON");
    try {
      raw = JSON.parse(cleaned.slice(first, last + 1));
    } catch {
      throw new Error("The writer did not return JSON");
    }
  }
  const r = raw as Record<string, unknown>;
  if (!r || typeof r !== "object" || typeof r.caption !== "string" || !r.caption.trim()) {
    throw new Error("The reply had no caption");
  }
  const hashtags = Array.isArray(r.hashtags) ? r.hashtags.filter((h): h is string => typeof h === "string") : [];
  return { caption: r.caption, hashtags, altText: typeof r.alt_text === "string" ? r.alt_text : "" };
}

const EMOJI_RE = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/gu;

// Built from code points so no long dash character sits in this source file.
const LONG_DASH = `[${String.fromCharCode(0x2014)}${String.fromCharCode(0x2013)}]`;

/** Long dashes out: a comma mid-sentence, a full stop at the end of a line, a hyphen in a range. */
export function stripLongDashes(text: string): string {
  return text
    .replace(new RegExp(`\\s*${LONG_DASH}\\s*(?=\\n|$)`, "g"), ".")
    .replace(new RegExp(`(\\d)\\s*${LONG_DASH}\\s*(\\d)`, "g"), "$1-$2") // ranges such as 5-9pm
    .replace(new RegExp(`\\s*${LONG_DASH}\\s*`, "g"), ", ");
}

/**
 * Clean a caption: no long dashes, no emoji unless allowed (and then at most
 * two), tidy whitespace.
 */
export function sanitiseCaption(caption: string, allowEmoji: boolean): string {
  let t = stripLongDashes(caption.replace(/\r\n/g, "\n"));
  if (allowEmoji) {
    let seen = 0;
    t = t.replace(EMOJI_RE, (m) => (++seen <= 2 ? m : ""));
  } else {
    t = t.replace(EMOJI_RE, "");
  }
  t = t.replace(/(^|\s)#[A-Za-z0-9_]+/g, "$1"); // hashtags belong in their own block
  return t.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").replace(/ {2,}/g, " ").trim();
}

/** Normalise hashtags: leading #, letters and digits only, no repeats, capped. */
export function normaliseHashtags(modelTags: string[], standing: string[] = [], max = 8): string[] {
  const out: string[] = [];
  for (const raw of [...modelTags, ...standing]) {
    const word = raw.replace(/[^A-Za-z0-9]/g, "");
    if (!word) continue;
    const tag = `#${word}`;
    if (!out.some((o) => o.toLowerCase() === tag.toLowerCase())) out.push(tag);
  }
  return out.slice(0, max);
}

/** The text stored on the post: the caption, then a blank line, then the hashtags. */
export function composePost(caption: string, hashtags: string[]): string {
  return hashtags.length > 0 ? `${caption}\n\n${hashtags.join(" ")}` : caption;
}

export function wordCount(text: string): number {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

export function firstLine(text: string): string {
  return text.split("\n")[0] ?? "";
}

const FIGURE_RE = /£\s?\d+(?:[.,]\d+)?|\b\d{1,2}(?:[:.]\d{2})?\s?(?:am|pm)\b|\b\d+(?:[.,]\d+)?\s?%|\b\d{1,2}(?:st|nd|rd|th)\b|\b\d+(?:[.,]\d+)?\b/gi;

function normaliseFigure(f: string): string {
  return f.toLowerCase().replace(/\s+/g, "").replace(/^£/, "£").replace(/\.00$/, "");
}

/**
 * Figures in the caption (prices, times, dates, percentages, plain numbers)
 * that do not appear in what the person supplied or in the forecast. Any hit
 * means the writer may have invented something, so the post is regenerated
 * once and, if it persists, flagged for the person to check.
 */
export function findUnsupportedFigures(caption: string, supplied: string): string[] {
  const allowed = new Set((supplied.match(FIGURE_RE) || []).map(normaliseFigure));
  // A number inside an allowed figure counts too: "7pm" allows "7".
  const allowedDigits = new Set([...allowed].flatMap((f) => f.match(/\d+(?:[.,]\d+)?/g) || []));
  const found = new Set<string>();
  for (const m of caption.match(FIGURE_RE) || []) {
    const n = normaliseFigure(m);
    if (allowed.has(n)) continue;
    const digits = n.match(/\d+(?:[.,]\d+)?/g) || [];
    if (digits.length > 0 && digits.every((d) => allowedDigits.has(d))) continue;
    found.add(m.trim());
  }
  return [...found];
}

export function resolvePostType(slug: string): PostTypeOption {
  const pt = getPostType(slug);
  if (!pt || pt.pack !== "hospitality") throw new Error(`Not a hospitality post type: ${slug}`);
  return pt;
}
