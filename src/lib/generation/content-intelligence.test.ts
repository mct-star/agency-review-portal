import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/providers", () => ({ resolveProvider: vi.fn() }));

import { isLongForm, runGate4AIVoiceDetection, runGate5StructureFormatting } from "./content-intelligence";

const para = (chars: number) => "Word ".repeat(Math.ceil(chars / 5)).trim();

describe("long-form gates", () => {
  it("treats blogs and LinkedIn articles as long form, and nothing else", () => {
    expect(isLongForm("blog_article")).toBe(true);
    expect(isLongForm("linkedin_article")).toBe(true);
    expect(isLongForm("insight")).toBe(false);
  });

  it("lets an article's paragraph run to 4 or 5 sentences, but not a post's", () => {
    const body = para(450);
    expect(runGate4AIVoiceDetection(body, true).passed).toBe(true);
    expect(runGate4AIVoiceDetection(body, false).explanation).toContain("Wall-of-text");
    expect(runGate4AIVoiceDetection(para(900), true).explanation).toContain("4 to 5 sentences");
  });

  it("does not ask an article for a first comment, but still asks a post", () => {
    const opts = (postTypeSlug: string) => ({ postTypeSlug });
    expect(runGate5StructureFormatting("An opening line.", "A title", null, opts("blog_article")).explanation).not.toContain("First comment");
    expect(runGate5StructureFormatting("An opening line.", "A title", null, opts("insight")).explanation).toContain("First comment");
  });

  it("still fails an article that uses a dash", () => {
    expect(runGate5StructureFormatting("One thing — another.", "A title", null, { postTypeSlug: "blog_article" }).passed).toBe(false);
  });
});
