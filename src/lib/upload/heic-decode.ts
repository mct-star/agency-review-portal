/**
 * Decode a HEIC/HEIF image to raw RGBA pixels with libheif.
 *
 * libheif-js (libheif 1.23, current) was chosen over heic2any, which wraps
 * libheif 1.12 and has not been updated since 2023: the newer decoder is the
 * one that keeps up with what current iPhones write. The wasm build is
 * pre-bundled into the JS (no separate .wasm file to serve) and is loaded
 * only when a HEIC file is actually picked, so it costs nothing otherwise.
 *
 * Kept separate from the worker so the same code runs in a test.
 */

export interface DecodedImage {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

interface HeifLike {
  HeifDecoder: new () => {
    decode(buffer: ArrayBuffer | Uint8Array): Array<{
      get_width(): number;
      get_height(): number;
      display(
        target: { data: Uint8ClampedArray; width: number; height: number },
        cb: (r: { data: Uint8ClampedArray } | null) => void
      ): void;
    }>;
  };
}

export async function decodeHeic(libheif: HeifLike, buffer: ArrayBuffer): Promise<DecodedImage> {
  const images = new libheif.HeifDecoder().decode(new Uint8Array(buffer));
  const image = images?.[0];
  if (!image) throw new Error("No image found in the HEIC file");
  const width = image.get_width();
  const height = image.get_height();
  const out = await new Promise<{ data: Uint8ClampedArray } | null>((resolve) =>
    image.display({ data: new Uint8ClampedArray(width * height * 4), width, height }, resolve)
  );
  if (!out) throw new Error("The HEIC file could not be decoded");
  return { width, height, data: out.data };
}
