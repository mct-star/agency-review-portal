import { describe, expect, it } from "vitest";
import { formatNotesForCopy, paragraphQuote, pickBlockInView, sortNotes } from "./review-notes";

// Viewport 900px tall: the reading line sits at 300px.
const H = 900;

describe("pickBlockInView (note to paragraph anchoring)", () => {
  it("picks the paragraph crossing the reading line", () => {
    const blocks = [
      { top: -400, bottom: 100 },
      { top: 120, bottom: 280 },
      { top: 290, bottom: 520 },
      { top: 540, bottom: 800 },
    ];
    expect(pickBlockInView(blocks, H)).toBe(2);
  });

  it("follows the reader as they scroll", () => {
    const at = (offset: number) => [0, 1, 2, 3, 4].map((i) => ({ top: i * 400 - offset, bottom: i * 400 + 380 - offset }));
    expect(pickBlockInView(at(0), H)).toBe(0);
    expect(pickBlockInView(at(400), H)).toBe(1);
    expect(pickBlockInView(at(1200), H)).toBe(3);
  });

  it("falls back to the nearest visible paragraph when the line sits in a gap", () => {
    const blocks = [
      { top: 50, bottom: 260 }, // 40px above the line
      { top: 330, bottom: 600 }, // 30px below the line
    ];
    expect(pickBlockInView(blocks, H)).toBe(1);
  });

  it("uses the last paragraph still on screen at the end of the article", () => {
    const blocks = [
      { top: -900, bottom: -500 },
      { top: -480, bottom: 120 },
    ];
    expect(pickBlockInView(blocks, H)).toBe(1);
  });

  it("returns null when no paragraph is on screen", () => {
    expect(pickBlockInView([{ top: 1000, bottom: 1200 }], H)).toBeNull();
    expect(pickBlockInView([{ top: -800, bottom: -10 }], H)).toBeNull();
    expect(pickBlockInView([], H)).toBeNull();
  });

  it("ignores hidden blocks with no height", () => {
    expect(pickBlockInView([{ top: 300, bottom: 300 }, { top: 320, bottom: 500 }], H)).toBe(1);
  });
});

describe("paragraphQuote", () => {
  it("quotes the opening eight words and marks the cut", () => {
    expect(paragraphQuote("Most launches fail long before the first sales call is ever booked."))
      .toBe("Most launches fail long before the first sales...");
  });
  it("keeps a short paragraph whole and squashes whitespace", () => {
    expect(paragraphQuote("  Why it\n matters  ")).toBe("Why it matters");
    expect(paragraphQuote("   ")).toBe("");
  });
});

describe("sortNotes and formatNotesForCopy (copy-out)", () => {
  const notes = [
    { paragraph_index: 4, paragraph_quote: "The second claim needs a source...", body: "Add the reference.", created_at: "2026-11-12T10:03:00Z" },
    { paragraph_index: null, paragraph_quote: null, body: "Title is too long overall.", created_at: "2026-11-12T10:00:00Z" },
    { paragraph_index: 1, paragraph_quote: "Most launches fail long before the first sales...", body: " Cut this to one sentence. ", created_at: "2026-11-12T10:02:00Z" },
    { paragraph_index: 1, paragraph_quote: "Most launches fail long before the first sales...", body: "And open with the number.", created_at: "2026-11-12T10:04:00Z" },
  ];

  it("reads back in article order, then the order spoken, whole-piece notes last", () => {
    expect(sortNotes(notes).map((n) => n.body.trim())).toEqual([
      "Cut this to one sentence.",
      "And open with the number.",
      "Add the reference.",
      "Title is too long overall.",
    ]);
  });

  it("copies as one plain-text list: paragraph quote, then the note", () => {
    expect(formatNotesForCopy("Why launches stall", notes)).toBe(
      [
        "Review notes | Why launches stall",
        "",
        '1. "Most launches fail long before the first sales..."',
        "Cut this to one sentence.",
        "",
        '2. "Most launches fail long before the first sales..."',
        "And open with the number.",
        "",
        '3. "The second claim needs a source..."',
        "Add the reference.",
        "",
        "4. Whole piece",
        "Title is too long overall.",
      ].join("\n"),
    );
  });

  it("says so when there are no notes", () => {
    expect(formatNotesForCopy("", [])).toBe("Review notes | Untitled\n\nNo notes yet.");
  });

  it("uses no long dashes", () => {
    const longDashes = new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]`);
    expect(formatNotesForCopy("T", notes)).not.toMatch(longDashes);
  });
});
