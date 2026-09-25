/**
 * A blog article, asked for through the Blog / Article page (25 Sept 2026).
 *
 * Every blog is built on the three layers of the content architecture:
 *   content pillar   the subject (P1 to P5, and OA, as the topic bank codes them)
 *   audience problem the relevance, in the reader's language (A, V, S)
 *   brand pillar     the credibility, carried implicitly and never named
 * The codes are the ones the topic bank already uses, so a topic picked from
 * the bank fills the first two layers itself.
 */

export const CONTENT_PILLARS = [
  { code: "P1", label: "Getting Products to Market" },
  { code: "P2", label: "Earning Attention in the Healthcare Attention Economy" },
  { code: "P3", label: "Patient Marketing as the Growth Lever" },
  { code: "P4", label: "Events That Build Pipeline" },
  { code: "P5", label: "Commercial Messaging That Lands" },
  { code: "OA", label: "Overarching" },
] as const;

export const AUDIENCE_PROBLEMS = [
  { code: "A", label: "Accessing Your Audience" },
  { code: "V", label: "Demonstrating Value" },
  { code: "S", label: "Standing Out in a Crowded Marketplace" },
] as const;

export const BRAND_PILLARS = [
  { code: "experience", label: "Healthcare Experience Not Marketing Theory" },
  { code: "compliant", label: "Compliant Creativity" },
  { code: "systems", label: "Systems That Transfer" },
] as const;

/** Upper word limits to choose from; 1,800 is always the floor (the content method is 1,800 to 2,500). */
export const BLOG_WORD_TARGETS = [2000, 2200, 2500] as const;
export const BLOG_WORD_MIN = 1800;

const labelFor = <T extends { code: string; label: string }>(list: readonly T[], code: string) =>
  list.find(i => i.code === code)?.label ?? null;

export const pillarLabel = (code: string) => labelFor(CONTENT_PILLARS, code);
export const audienceLabel = (code: string) => labelFor(AUDIENCE_PROBLEMS, code);
export const brandPillarLabel = (code: string) => labelFor(BRAND_PILLARS, code);

/**
 * The audience problem codes a topic bank entry carries. The bank holds
 * "A", "A, V", and the older spelled-out "Access", "Value", "Standing Out".
 */
export function audienceCodesOf(theme: string | null | undefined): string[] {
  const out = new Set<string>();
  for (const part of (theme || "").split(",").map(s => s.trim().toLowerCase())) {
    if (part === "a" || part.startsWith("access")) out.add("A");
    else if (part === "v" || part.startsWith("value")) out.add("V");
    else if (part === "s" || part.startsWith("standing")) out.add("S");
  }
  return [...out];
}

export interface BlogRequest {
  companyId: string;
  topicId: string | null;
  topicTitle: string;
  pillar: string;
  audienceTheme: string;
  brandPillar: string;
  wordCountMax: number;
  additionalContext: string | null;
}

/** Checks a request body; returns the request or the reason it is refused. */
export function parseBlogRequest(body: unknown): { ok: true; value: BlogRequest } | { ok: false; error: string } {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const str = (k: string) => (typeof b[k] === "string" ? (b[k] as string).trim() : "");
  const companyId = str("companyId");
  const topicTitle = str("topicTitle");
  const pillar = str("pillar");
  const audienceTheme = str("audienceTheme");
  const brandPillar = str("brandPillar");
  const wordCountMax = Number(b.wordCountMax);

  if (!companyId) return { ok: false, error: "Choose a company." };
  if (topicTitle.length < 8) return { ok: false, error: "Give the article a topic or working title." };
  if (!pillarLabel(pillar)) return { ok: false, error: "Choose a content pillar." };
  if (!audienceLabel(audienceTheme)) return { ok: false, error: "Choose the audience problem it speaks to." };
  if (!brandPillarLabel(brandPillar)) return { ok: false, error: "Choose the brand pillar it earns credibility on." };
  if (!(BLOG_WORD_TARGETS as readonly number[]).includes(wordCountMax)) {
    return { ok: false, error: `Word count must be one of ${BLOG_WORD_TARGETS.join(", ")}.` };
  }
  return {
    ok: true,
    value: {
      companyId, topicTitle, pillar, audienceTheme, brandPillar, wordCountMax,
      topicId: str("topicId") || null,
      additionalContext: str("additionalContext") || null,
    },
  };
}

/** The three layers, written for the writer. The brand pillar is a steer, never a heading. */
export function threeLayerBrief(r: Pick<BlogRequest, "pillar" | "audienceTheme" | "brandPillar">): string {
  return [
    "THREE-LAYER CONTENT ARCHITECTURE (build the article on all three at once):",
    `- Layer 1, content pillar (the subject): ${pillarLabel(r.pillar)}`,
    `- Layer 2, audience problem (the relevance, in the reader's language): ${audienceLabel(r.audienceTheme)}`,
    `- Layer 3, brand pillar (the credibility, implicit, never named in the copy): ${brandPillarLabel(r.brandPillar)}`,
    "Problem first, never methodology first. Move the reader one step from sales-led thinking to system-led thinking.",
  ].join("\n");
}
