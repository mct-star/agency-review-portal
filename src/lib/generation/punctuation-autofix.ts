/**
 * Dash Autofix (29 Sept 2026)
 *
 * A single en dash sank an 1,839-word article: "The twelve[en dash]minute
 * meeting slot" tripped the Formatting Mandates (C6) critical check, and the
 * fix loop could not remove it in three rounds, because a model cannot
 * reliably tell an en dash from a hyphen. This is a mechanical fix that runs
 * before the quality tests, so the model is never asked to do the one thing
 * it is bad at.
 *
 * It mirrors the masking approach of the Mac pipeline's fixer
 * (~/.claude/plugins/agency-workforce/scripts/voice_autofix.py): markdown
 * headers are skipped entirely, and URLs, clock times, and bracket markers
 * are protected so their contents are never rewritten. The dash rules
 * themselves are smarter than the Mac's (which turns every dash into a
 * comma), because an en dash and an em dash are typically different mistakes:
 *
 *   1. A dash between two digits, spaced or not, is a mistyped range:
 *      "1,800[en dash]2,500" becomes "1,800 to 2,500".
 *   2. An en dash directly between two word characters (no spaces) is a
 *      mistyped hyphen: "twelve[en dash]minute" becomes "twelve-minute".
 *   3. Everything else (an em dash anywhere, or an en dash with any
 *      surrounding whitespace) is a mistyped aside separator: "life[em
 *      dash]and" and "life [en dash] and" both become "life, and".
 *
 * Only dashes are in scope here. Semicolons and colons belong to AGENCY's
 * own voice canon, not to every company on the platform.
 */

export interface AutofixDashesResult {
  text: string;
  count: number;
}

const EN_DASH = String.fromCharCode(0x2013);
const EM_DASH = String.fromCharCode(0x2014);
const ANY_DASH_CLASS = `[${EN_DASH}${EM_DASH}]`;
const HAS_DASH_RE = new RegExp(ANY_DASH_CLASS);

const DIGIT_DASH_DIGIT_RE = new RegExp(`(\\d)\\s*${ANY_DASH_CLASS}\\s*(\\d)`, "g");
const EN_DASH_BETWEEN_WORD_CHARS_RE = new RegExp(`(\\w)${EN_DASH}(\\w)`, "g");
const REMAINING_DASH_RE = new RegExp(`\\s*${ANY_DASH_CLASS}\\s*`, "g");

// Spans whose contents must never be rewritten, masked out before the dash
// rules run and restored afterwards. Order matches the Mac fixer: bracket
// markers, then URLs, then clock times, plus inline code (markdown-specific,
// the Mac pipeline has no equivalent).
const PROTECTED_SPAN_PATTERNS: RegExp[] = [
  /\[\[[^\]]*\]\]/g, // [[image: hero]], [[image: 2]]
  /`[^`]*`/g, // inline code spans
  /https?:\/\/\S+/g, // URLs
  /\b\d{1,2}:\d{2}(?::\d{2})?\b/g, // clock times, e.g. 10:30
];

const MASK_START = String.fromCharCode(0) + String.fromCharCode(1);
const MASK_END = String.fromCharCode(1) + String.fromCharCode(0);

function maskProtectedSpans(line: string): { masked: string; restore: (s: string) => string } {
  const store: string[] = [];
  const stash = (match: string): string => {
    const token = `${MASK_START}${store.length}${MASK_END}`;
    store.push(match);
    return token;
  };

  let masked = line;
  for (const pattern of PROTECTED_SPAN_PATTERNS) {
    masked = masked.replace(pattern, stash);
  }

  const restore = (s: string): string => {
    let out = s;
    store.forEach((original, i) => {
      out = out.split(`${MASK_START}${i}${MASK_END}`).join(original);
    });
    return out;
  };

  return { masked, restore };
}

function fixDashesInMaskedText(input: string): { text: string; count: number } {
  let count = 0;
  let text = input;

  // Rule 1: a dash between two digits is a range.
  text = text.replace(DIGIT_DASH_DIGIT_RE, (_match, a: string, b: string) => {
    count++;
    return `${a} to ${b}`;
  });

  // Rule 2: an en dash between two word characters, no spaces, is a hyphen.
  // An em dash in the same position is not a hyphen mistake, it falls to
  // rule 3 below.
  text = text.replace(EN_DASH_BETWEEN_WORD_CHARS_RE, (_match, a: string, b: string) => {
    count++;
    return `${a}-${b}`;
  });

  // Rule 3: everything else, whatever whitespace surrounds it, is a comma.
  text = text.replace(REMAINING_DASH_RE, () => {
    count++;
    return ", ";
  });

  return { text, count };
}

/**
 * Mechanically fixes en and em dashes in `text`, without touching markdown
 * headers, URLs, clock times, bracket markers, or inline code spans.
 * Returns the fixed text and how many dashes were changed.
 */
export function autofixDashes(text: string): AutofixDashesResult {
  let count = 0;

  const lines = text.split("\n").map((line) => {
    if (line.trimStart().startsWith("#")) return line;
    if (!HAS_DASH_RE.test(line)) return line;

    const { masked, restore } = maskProtectedSpans(line);
    const { text: fixedMasked, count: lineCount } = fixDashesInMaskedText(masked);
    count += lineCount;
    return restore(fixedMasked);
  });

  return { text: lines.join("\n"), count };
}
