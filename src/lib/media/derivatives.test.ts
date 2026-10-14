import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { decodeJpegFrame, looksLikeJpeg, makeImageDerivatives, makePoster } from "./derivatives";

async function sample(width: number, height: number, orientation?: number) {
  let img = sharp({ create: { width, height, channels: 3, background: { r: 30, g: 120, b: 200 } } }).jpeg();
  if (orientation) img = img.withMetadata({ orientation });
  return img.toBuffer();
}

describe("makeImageDerivatives", () => {
  it("makes a thumbnail with a 400 px long edge and keeps the original size", async () => {
    const d = await makeImageDerivatives(await sample(4000, 3000));
    const meta = await sharp(d.thumb).metadata();
    expect(Math.max(meta.width!, meta.height!)).toBe(400);
    expect(meta.format).toBe("jpeg");
    expect(d.width).toBe(4000);
    expect(d.height).toBe(3000);
  });

  it("never enlarges a small photo", async () => {
    const d = await makeImageDerivatives(await sample(300, 200));
    const meta = await sharp(d.thumb).metadata();
    expect(meta.width).toBe(300);
  });

  it("makes a smaller copy for the tagger", async () => {
    const d = await makeImageDerivatives(await sample(4000, 3000));
    const meta = await sharp(d.vision).metadata();
    expect(Math.max(meta.width!, meta.height!)).toBe(1024);
  });

  it("stands a sideways-stored phone photo upright", async () => {
    // Stored 400x300 with orientation 6 (rotate 90): it displays 300x400, portrait.
    const d = await makeImageDerivatives(await sample(400, 300, 6));
    expect(d.width).toBe(300);
    expect(d.height).toBe(400);
  });

  it("makes a poster no larger than a thumbnail", async () => {
    const meta = await sharp(await makePoster(await sample(1920, 1080))).metadata();
    expect(meta.width).toBe(400);
  });
});

describe("decodeJpegFrame", () => {
  it("accepts a JPEG data URL", async () => {
    const buf = await sample(64, 64);
    expect(looksLikeJpeg(decodeJpegFrame(`data:image/jpeg;base64,${buf.toString("base64")}`)!)).toBe(true);
  });
  it("refuses something that is not a JPEG, or is too large", () => {
    expect(decodeJpegFrame(Buffer.from("hello").toString("base64"))).toBeNull();
    expect(decodeJpegFrame(42)).toBeNull();
    expect(decodeJpegFrame("A".repeat(2_000_000))).toBeNull();
  });
});
