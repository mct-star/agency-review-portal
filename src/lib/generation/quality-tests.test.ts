import { describe, it, expect } from "vitest";
import { runQualityTests } from "./quality-tests";

const blogOptions = { contentType: "blog_article" };

describe("runQualityTests: stilted question-tag expansion", () => {
  it("fails an article that expands a question tag into a stilted form, the 28 Sept article's own words", () => {
    const body = "It is a peculiar situation, is not it? (And one we see far too often.)";
    const result = runQualityTests(body, "A title", null, blogOptions);
    const stilted = result.allResults.find((r) => r.message.includes("is not it"));
    expect(stilted).toBeDefined();
    expect(stilted!.passed).toBe(false);
    expect(stilted!.severity).toBe("high");
  });

  it("applies to every content type, not only long-form", () => {
    const body = "Good session, is not it?";
    const result = runQualityTests(body, "A title", null, { contentType: "insight" });
    const stilted = result.allResults.find((r) => r.testId === "stilted_expansion");
    expect(stilted?.passed).toBe(false);
  });

  it("does not fail a natural contraction used as a question tag", () => {
    const body = "Tough one, isn't it? Most weeks feel that way.";
    const result = runQualityTests(body, "A title", null, blogOptions);
    const stilted = result.allResults.find((r) => r.testId === "stilted_expansion");
    expect(stilted?.passed).toBe(true);
  });

  it("does not fail a plain contraction mid-sentence", () => {
    const body = "It's not a sales problem. It never was.";
    const result = runQualityTests(body, "A title", null, blogOptions);
    const stilted = result.allResults.find((r) => r.testId === "stilted_expansion");
    expect(stilted?.passed).toBe(true);
  });

  it("no longer runs an anti-contraction test at all", () => {
    const body = "Tough one, isn't it? It's not a sales problem, and it never was.";
    const result = runQualityTests(body, "A title", null, blogOptions);
    expect(result.allResults.some((r) => r.testId === "long_form_contraction")).toBe(false);
    expect(result.allResults.some((r) => /anti-contraction/i.test(r.testName))).toBe(false);
    expect(result.allResults.some((r) => /contraction/i.test(r.message))).toBe(false);
  });
});

describe("runQualityTests: banned vocabulary stays critical", () => {
  it("still fails C5_banned_vocab as critical for robust and ecosystem", () => {
    const body = "Together, we will develop robust, ethical patient engagement strategies that position AGENCY as a supportive partner in the healthcare ecosystem.";
    const result = runQualityTests(body, "A title", null, blogOptions);
    const banned = result.allResults.find((r) => r.testId === "C5_banned_vocab");
    expect(banned).toBeDefined();
    expect(banned!.passed).toBe(false);
    expect(banned!.severity).toBe("critical");
    expect(result.criticalFailures.some((r) => r.testId === "C5_banned_vocab")).toBe(true);
  });
});
