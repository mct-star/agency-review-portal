import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
// eslint-disable-next-line @typescript-eslint/no-require-imports
import libheif from "libheif-js/wasm-bundle";
import { decodeHeic } from "./heic-decode";

// A 96 x 64 HEIC made from a synthetic gradient: left half bluish, right half warm.
const fixture = readFileSync(path.join(__dirname, "__fixtures__/small.heic"));
const toArrayBuffer = (b: Buffer) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;

describe("decodeHeic", () => {
  it("decodes a real HEIC file to RGBA pixels of the right size", async () => {
    const img = await decodeHeic(libheif as never, toArrayBuffer(fixture));
    expect(img.width).toBe(96);
    expect(img.height).toBe(64);
    expect(img.data.length).toBe(96 * 64 * 4);
  });

  it("returns pixels that follow the picture, not a blank frame", async () => {
    const img = await decodeHeic(libheif as never, toArrayBuffer(fixture));
    const px = (x: number, y: number) => Array.from(img.data.slice((y * 96 + x) * 4, (y * 96 + x) * 4 + 3));
    const left = px(10, 32);
    const right = px(85, 32);
    // Left half was written with a high blue channel, right half with a low one.
    expect(left[2]).toBeGreaterThan(right[2] + 60);
  });

  it("refuses a file that is not a HEIC image", async () => {
    await expect(decodeHeic(libheif as never, toArrayBuffer(Buffer.from("not an image at all")))).rejects.toThrow();
  });
});
