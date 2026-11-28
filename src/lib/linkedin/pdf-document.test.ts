import { describe, expect, it } from "vitest";
import { countPdfPages, LINKEDIN_DOCUMENT_MAX_BYTES, validateLinkedInPdf } from "./pdf-document";

const pdf = (pages: number) => Buffer.from(`%PDF-1.4\n<< /Type /Pages /Count ${pages} >>\n${"<< /Type /Page >>\n".repeat(pages)}%%EOF`, "latin1");

describe("validateLinkedInPdf", () => {
  it("accepts a real PDF served as application/pdf", () => {
    expect(validateLinkedInPdf(pdf(5), "application/pdf")).toBeNull();
    expect(validateLinkedInPdf(pdf(5), "application/pdf; charset=binary")).toBeNull();
  });

  it("counts pages and not the page tree", () => {
    expect(countPdfPages(pdf(7))).toBe(7);
  });

  it("refuses a file that is not a PDF, whatever it is called", () => {
    expect(validateLinkedInPdf(Buffer.from("<html>not a pdf</html>"), "application/pdf")).toMatch(/PDF/);
    expect(validateLinkedInPdf(pdf(2), "image/png")).toMatch(/PDF/);
  });

  it("refuses an empty file, one over 100 MB and one over 300 pages", () => {
    expect(validateLinkedInPdf(Buffer.alloc(0), "application/pdf")).toMatch(/empty/);
    const big = Buffer.alloc(LINKEDIN_DOCUMENT_MAX_BYTES + 1);
    big.write("%PDF-1.4");
    expect(validateLinkedInPdf(big, "application/pdf")).toMatch(/100 MB/);
    expect(validateLinkedInPdf(pdf(301), "application/pdf")).toMatch(/300/);
    expect(validateLinkedInPdf(pdf(300), "application/pdf")).toBeNull();
  });
});
