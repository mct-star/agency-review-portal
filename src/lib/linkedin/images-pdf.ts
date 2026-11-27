import sharp from "sharp";

/** Pixels per inch for each page, as the Mac publisher (Pillow, resolution=150) saves them. */
const DOTS_PER_INCH = 150;
const POINTS_PER_INCH = 72;

function points(pixels: number): string {
  return String(Math.round(((pixels * POINTS_PER_INCH) / DOTS_PER_INCH) * 1000) / 1000);
}

/**
 * Several post images as one PDF, one page per image in order, each page the
 * image's own size. LinkedIn shows a document post as the swipeable
 * carousel; a multi-image post shows a grid (Michael, 26 Nov 2026).
 *
 * Images are flattened onto white and re-encoded as JPEG, as Pillow's RGB
 * conversion does on the Mac, then embedded as they are (DCTDecode). The PDF
 * is written directly: it needs no fonts, so nothing is read from disk at
 * run time.
 */
export async function imagesToPdf(images: Buffer[]): Promise<Buffer> {
  if (images.length === 0) throw new Error("A document post needs at least one image");
  const pages = await Promise.all(images.map(async (image) => {
    const { data, info } = await sharp(image).rotate().flatten({ background: "#ffffff" }).jpeg({ quality: 92 }).toBuffer({ resolveWithObject: true });
    return { data, width: info.width, height: info.height };
  }));

  // Object numbers: 1 catalog, 2 page tree, then three per page (page, content, image).
  const pageObject = (i: number) => 3 + i * 3;
  const parts: Buffer[] = [];
  const offsets: number[] = [];
  let length = 0;
  const write = (chunk: Buffer | string) => {
    const buffer = typeof chunk === "string" ? Buffer.from(chunk, "latin1") : chunk;
    parts.push(buffer);
    length += buffer.length;
  };
  const startObject = (n: number) => { offsets[n] = length; write(`${n} 0 obj\n`); };

  write("%PDF-1.4\n%\xe2\xe3\xcf\xd3\n");
  startObject(1);
  write("<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");
  startObject(2);
  write(`<< /Type /Pages /Kids [${pages.map((_p, i) => `${pageObject(i)} 0 R`).join(" ")}] /Count ${pages.length} >>\nendobj\n`);
  pages.forEach((page, i) => {
    const n = pageObject(i);
    const width = points(page.width);
    const height = points(page.height);
    const content = `q\n${width} 0 0 ${height} 0 0 cm\n/Im0 Do\nQ\n`;
    startObject(n);
    write(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] /Resources << /XObject << /Im0 ${n + 2} 0 R >> >> /Contents ${n + 1} 0 R >>\nendobj\n`);
    startObject(n + 1);
    write(`<< /Length ${Buffer.byteLength(content, "latin1")} >>\nstream\n${content}endstream\nendobj\n`);
    startObject(n + 2);
    write(`<< /Type /XObject /Subtype /Image /Width ${page.width} /Height ${page.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.data.length} >>\nstream\n`);
    write(page.data);
    write("\nendstream\nendobj\n");
  });

  const objectCount = 2 + pages.length * 3;
  const xref = length;
  write(`xref\n0 ${objectCount + 1}\n0000000000 65535 f \n`);
  for (let n = 1; n <= objectCount; n++) write(`${String(offsets[n]).padStart(10, "0")} 00000 n \n`);
  write(`trailer\n<< /Size ${objectCount + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return Buffer.concat(parts);
}
