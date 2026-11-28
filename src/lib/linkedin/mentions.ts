import { escapeLittleText } from "@/lib/linkedin/post-text";

/**
 * Real LinkedIn mentions (28 Nov 2026).
 *
 * Michael writes a mention as ＠Name (the full-width at sign, or a plain @).
 * The approved text keeps exactly that. Only at publish time does a name in
 * the maintained list become LinkedIn's mention markup, per the Posts API:
 *   @[Name](urn:li:person:...)  or  @[Name](urn:li:organization:...)
 * A name with no URN in the list stays plain text and is reported, so the
 * preview can warn before anything goes out.
 */

export interface MentionEntry { name: string; urn: string; kind: "person" | "organization" }

const PERSON_URN = /^urn:li:person:[A-Za-z0-9_-]+$/;
const ORG_URN = /^urn:li:organization:\d+$/;

/** A URN valid for its kind, or an error message. */
export function validateMentionUrn(kind: string, urn: string): string | null {
  if (kind === "person") return PERSON_URN.test(urn) ? null : "A person URN looks like urn:li:person:AbCdEf123.";
  if (kind === "organization") return ORG_URN.test(urn) ? null : "An organisation URN looks like urn:li:organization:12345.";
  return "Choose person or organisation.";
}

/** A ＠ followed by a word (any case), then up to three capitalised words: the shape of a name someone typed. */
const UNLISTED_NAME = /^(\p{L}[\p{L}'’.-]*(?: \p{Lu}[\p{L}'’.-]*){0,3})/u;
const WORD_CHAR = /[\p{L}\p{N}]/u;
/** Before a ＠ these mean it is part of an address, not a mention: a letter, a digit or a slash (medium.com/＠Jane). */
const INSIDE_ADDRESS = /[\p{L}\p{N}/]/u;

export interface MentionResult {
  /** Escaped little text, with mention markup for every listed name. */
  commentary: string;
  converted: string[];
  /** Names written after a ＠ that are not in the list: published as plain text. */
  unknown: string[];
}

/**
 * Plain post text (already through toLinkedInText) to the commentary that is
 * sent. With no ＠ in the text this equals escapeLittleText(text).trim(), so
 * posts without mentions are unchanged. Names match without regard to case
 * and on whole words; the longest listed name wins ("Jane Smith" beats
 * "Jane"). A @ inside a word (an email address) is not a mention.
 */
export function applyMentions(plainText: string, list: MentionEntry[]): MentionResult {
  const longestFirst = [...list].sort((a, b) => b.name.length - a.name.length);
  const converted: string[] = [];
  const unknown: string[] = [];
  let out = "";
  let last = 0;
  for (const mark of plainText.matchAll(/[＠@]/g)) {
    const at = mark.index ?? 0;
    if (at < last) continue;
    if (at > 0 && INSIDE_ADDRESS.test(plainText[at - 1])) continue;
    const rest = plainText.slice(at + 1);
    const hit = longestFirst.find((m) => {
      const name = m.name.trim().replace(/\s+/g, " ");
      if (!name || rest.slice(0, name.length).toLowerCase() !== name.toLowerCase()) return false;
      const next = rest[name.length];
      return next === undefined || !WORD_CHAR.test(next);
    });
    if (hit) {
      const name = hit.name.trim().replace(/\s+/g, " ");
      out += escapeLittleText(plainText.slice(last, at)) + `@[${escapeLittleText(name)}](${hit.urn})`;
      if (!converted.includes(hit.name)) converted.push(hit.name);
      last = at + 1 + name.length;
      continue;
    }
    const typed = UNLISTED_NAME.exec(rest)?.[1];
    if (typed && !unknown.includes(typed)) unknown.push(typed);
  }
  out += escapeLittleText(plainText.slice(last));
  return { commentary: out.trim(), converted, unknown };
}

/** The names a post asks to mention that the list cannot resolve, for the preview. */
export function unknownMentionNames(plainText: string, list: MentionEntry[]): string[] {
  return applyMentions(plainText, list).unknown;
}
