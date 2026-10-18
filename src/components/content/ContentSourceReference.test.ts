import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import ContentSourceReference from "./ContentSourceReference";

const render = (reference: string | null, isAdmin = false) =>
  renderToStaticMarkup(createElement(ContentSourceReference, { reference, isAdmin }));

describe("content source reference", () => {
  const paths = [
    "/Users/example/Library/CloudStorage/GoogleDrive/example/import.docx",
    "file:///Users/example/import.docx",
    "FILE://server/shared/import.docx",
    "C:\\Users\\example\\import.docx",
    "D:/content/import.docx",
    "\\\\server\\shared\\import.docx",
    "\\content\\import.docx",
    "~/content/import.docx",
    "./content/import.docx",
    "../content/import.docx",
    ".\\content\\import.docx",
    "..\\content\\import.docx",
    "  /Users/example/import.docx  ",
  ];

  it.each(paths)("omits the raw import reference from all company markup: %s", (reference) => {
    const html = render(reference);
    expect(html).toContain(">Imported content</span>");
    expect(html).not.toContain(reference);
    expect(html).not.toContain("import.docx");
    expect(html).not.toContain("<details");
    expect(html).not.toContain("title=");
    expect(html).not.toContain("aria-label=");
  });

  it("keeps the full reference as plain text in collapsed admin provenance", () => {
    const reference = "/Users/example/private/import.docx";
    const html = render(reference, true);
    const details = /<details\b[^>]*>[\s\S]*?<\/details>/.exec(html)?.[0];
    expect(html).toContain(">Imported content</span>");
    expect(details).toContain("<summary");
    expect(details).toContain("Import source</summary>");
    expect(details).toContain(reference);
    expect(details).not.toMatch(/<details[^>]*\bopen(?:=|\s|>)/);
    expect(details).not.toContain("href=");
    expect(html.replace(details!, "")).not.toContain(reference);
  });

  it.each(["TB#12", "#12: A useful customer question", "Translation (DE) of: A useful post"])(
    "preserves ordinary references for both roles: %s",
    (reference) => {
      for (const isAdmin of [false, true]) {
        const html = render(reference, isAdmin);
        expect(html).toContain(reference);
        expect(html).not.toContain("Imported content");
        expect(html).not.toContain("<details");
      }
    },
  );

  it.each([null, ""])("does not add metadata for an absent reference", (reference) => {
    expect(render(reference)).toBe("");
  });
});
