import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { imagesToPdf } from "./images-pdf";

async function png(width: number, height: number, colour: string) {
  return sharp({ create: { width, height, channels: 4, background: colour } }).png().toBuffer();
}

describe("several images become one PDF document, one page per image", () => {
  it("makes a page per image in order, sized to each image", async () => {
    const pdf = await imagesToPdf([await png(1080, 1350, "#000000"), await png(1080, 1080, "#ffffff")]);
    const text = pdf.toString("latin1");
    expect(text.startsWith("%PDF-")).toBe(true);
    expect(text.match(/\/Type \/Page\b/g)).toHaveLength(2);
    // 150 dots per inch, as the Mac publisher saves them: 1080 px is 518.4 pt.
    expect(text).toMatch(/\/MediaBox \[0 0 518\.4 648\]/);
    expect(text).toMatch(/\/MediaBox \[0 0 518\.4 518\.4\]/);
  });

  it("is a PDF a reader opens, with every page", async () => {
    const pdf = await imagesToPdf([await png(800, 1000, "#123456"), await png(1000, 800, "#654321"), await png(600, 600, "#abcdef")]);
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: new Uint8Array(pdf) });
    try {
      expect((await parser.getInfo()).total).toBe(3);
    } finally {
      await parser.destroy().catch(() => undefined);
    }
  });

  it("refuses an empty list", async () => {
    await expect(imagesToPdf([])).rejects.toThrow();
  });
});
