import { describe, it, expect, vi } from "vitest";
import { generateWithValidation } from "./validated-generator";
import type {
  ContentProvider,
  ContentGenerationInput,
  ContentGenerationOutput,
} from "@/lib/providers";

// Real en dash and em dash, built at runtime so this file never carries the
// glyph the autofix exists to remove.
const EN_DASH = String.fromCharCode(0x2013);
const EM_DASH = String.fromCharCode(0x2014);
const DASH_RE = new RegExp(`[${EN_DASH}${EM_DASH}]`);

const input: ContentGenerationInput = {
  blueprintContent: "test blueprint",
  topicTitle: "test topic",
  topicDescription: null,
  pillar: null,
  audienceTheme: null,
  contentType: "blog_article",
  weekNumber: 1,
  spokespersonName: null,
};

function makeCleanExceptForOneEnDash(): ContentGenerationOutput {
  return {
    title: "The Meeting That Never Had Enough Time",
    markdownBody:
      "Hospital corridors are quiet at night. (Most staff have gone home by then.) " +
      `A clinician once told me the twelve${EN_DASH}minute meeting slot never gave enough room for questions. ` +
      "(We heard that from three other trusts too.) NHS teams keep repeating the same pattern. " +
      "(Nobody seems to name it out loud.)",
    firstComment: null,
    wordCount: 55,
    postType: "blog_article",
    imagePrompt: null,
    assets: [],
  };
}

describe("generateWithValidation: dash autofix runs before the quality tests", () => {
  it("passes on the first attempt and never calls the fix provider, when the only problem is an en dash", async () => {
    const provider: ContentProvider = {
      generate: vi.fn(async () => makeCleanExceptForOneEnDash()),
    };
    const fixProvider = {
      fix: vi.fn(async (content: ContentGenerationOutput) => content),
    };

    const result = await generateWithValidation(provider, input, fixProvider);

    expect(fixProvider.fix).not.toHaveBeenCalled();
    expect(result.iterations).toBe(1);
    expect(result.validation.allPassed).toBe(true);
    expect(result.output.markdownBody).toContain("twelve-minute");
    expect(DASH_RE.test(result.output.markdownBody)).toBe(false);
  });

  it("records the autofix in the output's warnings", async () => {
    const provider: ContentProvider = {
      generate: vi.fn(async () => makeCleanExceptForOneEnDash()),
    };

    const result = await generateWithValidation(provider, input);

    expect(result.output.warnings?.some((w) => /dash/i.test(w))).toBe(true);
  });

  it("still fixes a dash introduced by a fix round, before re-testing", async () => {
    // This first draft is missing the required bracketed-aside count on
    // purpose (blog_article needs three, this has one), so the loop calls
    // the fix provider once. The fix provider's reply reintroduces an en
    // dash between two words with no spaces, which the second autofix pass
    // must also clean up, this time into a hyphen (the same rule as the
    // "twelve-minute" case above).
    const firstPass: ContentGenerationOutput = {
      title: "The Meeting That Never Had Enough Time",
      markdownBody:
        "Hospital corridors are quiet at night. A clinician once told me the meeting slot " +
        "never gave enough room for questions. NHS teams keep repeating the same pattern. " +
        "(Nobody seems to name it out loud.)",
      firstComment: null,
      wordCount: 40,
      postType: "blog_article",
      imagePrompt: null,
      assets: [],
    };

    const provider: ContentProvider = {
      generate: vi.fn(async () => firstPass),
    };
    const fixProvider = {
      fix: vi.fn(async (content: ContentGenerationOutput) => ({
        ...content,
        markdownBody:
          content.markdownBody +
          ` (We heard that from three${EN_DASH}four other trusts too.) ` +
          "(That was the point the clinician made twice.)",
      })),
    };

    const result = await generateWithValidation(provider, input, fixProvider);

    expect(fixProvider.fix).toHaveBeenCalledTimes(1);
    expect(DASH_RE.test(result.output.markdownBody)).toBe(false);
    expect(result.output.markdownBody).toContain("three-four other trusts");
  });
});
