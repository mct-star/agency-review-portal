import sharp from "sharp";

/**
 * Thumbnails and the smaller copy sent to the tagger, made with sharp.
 *
 * `.rotate()` with no argument applies the EXIF orientation, so a portrait
 * phone photo that is stored sideways comes out upright. The thumbnail is
 * what the library grid serves; the original is touched only when a post
 * is built or published.
 */

export const THUMB_LONG_EDGE = 400;
export const VISION_LONG_EDGE = 1024;

export interface ImageDerivatives {
  thumb: Buffer;
  vision: Buffer;
  /** Upright dimensions of the original, after orientation is applied. */
  width: number;
  height: number;
}

export async function makeImageDerivatives(original: Buffer): Promise<ImageDerivatives> {
  const upright = sharp(original, { failOn: "none" }).rotate();
  // metadata() reports the stored dimensions; EXIF orientation 5 to 8 means
  // the picture is shown turned a quarter, so width and height swap.
  const meta = await sharp(original, { failOn: "none" }).metadata();
  const turned = (meta.orientation ?? 1) >= 5;

  const [thumb, vision] = await Promise.all([
    upright
      .clone()
      .resize({ width: THUMB_LONG_EDGE, height: THUMB_LONG_EDGE, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 72, mozjpeg: true })
      .toBuffer(),
    upright
      .clone()
      .resize({ width: VISION_LONG_EDGE, height: VISION_LONG_EDGE, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 70 })
      .toBuffer(),
  ]);

  return {
    thumb,
    vision,
    width: (turned ? meta.height : meta.width) ?? 0,
    height: (turned ? meta.width : meta.height) ?? 0,
  };
}

/** A video's poster: a still frame from the browser, resized to thumbnail size. */
export async function makePoster(frame: Buffer): Promise<Buffer> {
  return sharp(frame, { failOn: "none" })
    .rotate()
    .resize({ width: THUMB_LONG_EDGE, height: THUMB_LONG_EDGE, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 72, mozjpeg: true })
    .toBuffer();
}

/** Resize a frame for the tagger. */
export async function visionCopy(frame: Buffer): Promise<Buffer> {
  return sharp(frame, { failOn: "none" })
    .rotate()
    .resize({ width: VISION_LONG_EDGE, height: VISION_LONG_EDGE, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 70 })
    .toBuffer();
}

const JPEG_MAGIC = [0xff, 0xd8, 0xff];

export function looksLikeJpeg(buf: Buffer): boolean {
  return buf.length > 3 && JPEG_MAGIC.every((b, i) => buf[i] === b);
}

/** Decode a data URL or bare base64 string of a JPEG frame, or null. */
export function decodeJpegFrame(value: unknown, maxBytes = 600_000): Buffer | null {
  if (typeof value !== "string") return null;
  const b64 = value.replace(/^data:image\/jpeg;base64,/, "");
  if (b64.length > maxBytes * 1.4) return null;
  const buf = Buffer.from(b64, "base64");
  return buf.length <= maxBytes && looksLikeJpeg(buf) ? buf : null;
}
