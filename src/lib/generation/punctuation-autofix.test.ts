import { describe, it, expect } from "vitest";
import { autofixDashes } from "./punctuation-autofix";

// Real en dash and em dash, built at runtime so this file itself never
// carries the glyph the function exists to remove.
const EN_DASH = String.fromCharCode(0x2013);
const EM_DASH = String.fromCharCode(0x2014);

describe("autofixDashes", () => {
  it("turns an en dash between two word characters with no spaces into a hyphen", () => {
    const result = autofixDashes(`The twelve${EN_DASH}minute meeting slot`);
    expect(result.text).toBe("The twelve-minute meeting slot");
    expect(result.count).toBe(1);
  });

  it("turns a dash between two digits into the word to", () => {
    const result = autofixDashes(`1,800${EN_DASH}2,500 words`);
    expect(result.text).toBe("1,800 to 2,500 words");
    expect(result.count).toBe(1);
  });

  it("turns a spaced dash between two digits into the word to, as the Mac fixer does", () => {
    const result = autofixDashes(`1,800 ${EN_DASH} 2,500 words`);
    expect(result.text).toBe("1,800 to 2,500 words");
    expect(result.count).toBe(1);
  });

  it("keeps an en dash between a letter and a digit as a hyphen", () => {
    const result = autofixDashes(`Since COVID${EN_DASH}19 it changed`);
    expect(result.text).toBe("Since COVID-19 it changed");
  });

  it("turns a spaced en dash into a comma", () => {
    const result = autofixDashes(`a fact of life ${EN_DASH} and a hard one`);
    expect(result.text).toBe("a fact of life, and a hard one");
    expect(result.count).toBe(1);
  });

  it("turns an unspaced em dash between words into a comma, not a hyphen", () => {
    const result = autofixDashes(`a fact of life${EM_DASH}and a hard one`);
    expect(result.text).toBe("a fact of life, and a hard one");
    expect(result.count).toBe(1);
  });

  it("leaves an [[image: ...]] marker untouched even when it contains a dash", () => {
    const input = `Intro line.\n\n[[image: twelve${EN_DASH}minute]]\n\nThe twelve${EN_DASH}minute meeting slot ran long.`;
    const result = autofixDashes(input);
    expect(result.text).toContain(`[[image: twelve${EN_DASH}minute]]`);
    expect(result.text).toContain("The twelve-minute meeting slot ran long.");
    expect(result.count).toBe(1);
  });

  it("leaves a numbered [[image: 2]] marker untouched when nothing else in the text has a dash", () => {
    const input = "Some text.\n\n[[image: 2]]\n\nMore text.";
    const result = autofixDashes(input);
    expect(result.text).toBe(input);
    expect(result.count).toBe(0);
  });

  it("leaves a URL untouched even when it contains a dash", () => {
    const input = `Read the piece at https://example.com/twelve${EN_DASH}minute-guide before the twelve${EN_DASH}minute call.`;
    const result = autofixDashes(input);
    expect(result.text).toContain(`https://example.com/twelve${EN_DASH}minute-guide`);
    expect(result.text).toContain("before the twelve-minute call.");
    expect(result.count).toBe(1);
  });

  it("leaves a clock time untouched", () => {
    const input = `The session starts at 10:30 and runs long${EM_DASH}nobody minds.`;
    const result = autofixDashes(input);
    expect(result.text).toBe("The session starts at 10:30 and runs long, nobody minds.");
    expect(result.count).toBe(1);
  });

  it("leaves a markdown heading line untouched", () => {
    const input = `# The Twelve${EN_DASH}Minute Rule\n\nThe twelve${EN_DASH}minute meeting slot was too short.`;
    const result = autofixDashes(input);
    expect(result.text).toBe(`# The Twelve${EN_DASH}Minute Rule\n\nThe twelve-minute meeting slot was too short.`);
    expect(result.count).toBe(1);
  });

  it("leaves an inline code span untouched", () => {
    const input = `Use the \`twelve${EN_DASH}minute\` constant, not the twelve${EN_DASH}minute label.`;
    const result = autofixDashes(input);
    expect(result.text).toBe(`Use the \`twelve${EN_DASH}minute\` constant, not the twelve-minute label.`);
    expect(result.count).toBe(1);
  });

  it("returns text unchanged with a zero count when there are no dashes", () => {
    const input = "This sentence has no dashes at all.";
    const result = autofixDashes(input);
    expect(result.text).toBe(input);
    expect(result.count).toBe(0);
  });
});
