import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import QuickGenerate from "./QuickGenerate";

vi.mock("@/lib/use-is-admin", () => ({ useIsAdmin: () => false }));
const companies = [
  { id: "company-a", name: "Alphabetical first", authorName: "Author A", authorTagline: "", brandColor: "#111111" },
  { id: "company-b", name: "Chosen company", authorName: "Author B", authorTagline: "", brandColor: "#222222" },
];

describe("the first post's company selection", () => {
  it("renders the actual company selector with the requested authorised company selected", () => {
    const html = renderToStaticMarkup(createElement(QuickGenerate, { companies, initialCompanyId: "company-b", showCompanyPicker: true }));
    expect(html).toContain('<option value="company-b" selected="">Chosen company</option>');
    expect(html).not.toContain('<option value="company-a" selected="">');
  });

  it("ignores a requested id absent from the authorised company options", () => {
    const html = renderToStaticMarkup(createElement(QuickGenerate, { companies, initialCompanyId: "company-other", showCompanyPicker: true }));
    expect(html).toContain('<option value="company-a" selected="">Alphabetical first</option>');
    expect(html).not.toContain("company-other");
  });
});
