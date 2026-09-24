import { describe, it, expect } from "vitest";
import { toLinkedInText, escapeLittleText, seeMoreFold } from "./post-text";

describe("toLinkedInText", () => {
  it("removes markdown the way LinkedIn readers need it gone", () => {
    const md = "## Hook\n\n**Bold** and *italic* here.\n\n- one\n- two\n\nRead [the guide](https://x.com/g).\n\n#healthcare #medtech";
    expect(toLinkedInText(md)).toBe("Hook\n\nBold and italic here.\n\none\ntwo\n\nRead the guide (https://x.com/g).");
  });
  it("leaves snake_case, maths and prices alone", () => {
    expect(toLinkedInText("post_type stays. 3 * 4 = 12. GBP 1,100.")).toBe("post_type stays. 3 * 4 = 12. GBP 1,100.");
  });
  it("keeps one-sentence-per-line spacing and collapses runs of blank lines", () => {
    expect(toLinkedInText("Line one.\nLine two.\n\n\n\nLine three.")).toBe("Line one.\nLine two.\n\nLine three.");
  });
});

describe("escapeLittleText", () => {
  it("escapes every little-text reserved character so nothing is cut or mis-tagged", () => {
    expect(escapeLittleText("Sales (and marketing) @ scale [v2] <b> #1 a_b ~x | {y} *z \\")).toBe(
      "Sales \\(and marketing\\) \\@ scale \\[v2\\] \\<b\\> \\#1 a\\_b \\~x \\| \\{y\\} \\*z \\\\",
    );
  });
  it("leaves ordinary punctuation untouched", () => {
    expect(escapeLittleText("It's 40%, not 60%. Right? Yes: done!")).toBe("It's 40%, not 60%. Right? Yes: done!");
  });
});

describe("seeMoreFold", () => {
  it("shows a short post whole", () => {
    expect(seeMoreFold("One line.\nTwo lines.", "desktop")).toEqual({ visible: "One line.\nTwo lines.", folded: false });
  });
  it("folds after three rendered lines, counting blank lines, on a word boundary", () => {
    const text = "Hook line.\n\nThe second paragraph is long enough that it wraps across the desktop column and keeps going well past it.";
    const d = seeMoreFold(text, "desktop");
    expect(d.folded).toBe(true);
    expect(d.visible.startsWith("Hook line.\n\nThe second paragraph")).toBe(true);
    expect(text.startsWith(d.visible)).toBe(true);
    expect(d.visible.endsWith(" ")).toBe(false);
  });
  it("folds earlier on mobile than on desktop", () => {
    const text = "A".repeat(10) + " " + "word ".repeat(60);
    expect(seeMoreFold(text, "mobile").visible.length).toBeLessThan(seeMoreFold(text, "desktop").visible.length);
  });
});
