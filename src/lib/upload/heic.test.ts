import { describe, it, expect, vi, beforeEach } from "vitest";
import { HEIC_UNSUPPORTED_MESSAGE, MAX_PHOTO_BYTES } from "./media-constants";

// The real converter is a wasm bundle that needs a browser, and the helper
// around it is what is under test, so the library is replaced. The factory
// also records the moment the module is first loaded, which is how the
// lazy-loading test can tell.
const lib = vi.hoisted(() => ({ heicTo: vi.fn(), loaded: vi.fn() }));
vi.mock("heic-to", () => {
  lib.loaded();
  return { heicTo: lib.heicTo };
});

import {
  HeicConversionError,
  PHOTO_PICKER_ACCEPT,
  isAcceptedPhoto,
  isHeicFile,
  jpegFilename,
  prepareImageForUpload,
} from "./heic";

const jpegBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 5]);

function file(name: string, type: string, bytes: Uint8Array<ArrayBuffer> = new Uint8Array([9, 9, 9])): File {
  return new File([bytes], name, { type });
}

function jpegBlob(bytes: Uint8Array<ArrayBuffer> = jpegBytes): Blob {
  return new Blob([bytes], { type: "image/jpeg" });
}

beforeEach(() => {
  lib.heicTo.mockReset();
  lib.loaded.mockClear();
});

describe("isHeicFile", () => {
  it.each([
    "image/heic",
    "image/heif",
    "image/heic-sequence",
    "image/heif-sequence",
    "IMAGE/HEIC",
    "image/heic; charset=binary",
  ])("recognises the type %s whatever the name says", (type) => {
    expect(isHeicFile({ name: "photo", type })).toBe(true);
  });

  it.each([
    ["IMG_0001.HEIC", ""],
    ["IMG_0001.heic", ""],
    ["a.heif", ""],
    ["A.HEIF", ""],
    ["IMG_0001.HEIC", "application/octet-stream"],
  ])("recognises %s sent with the type %j by its extension", (name, type) => {
    expect(isHeicFile({ name, type })).toBe(true);
  });

  it.each([
    ["a.jpg", "image/jpeg"],
    ["a.jpeg", "image/jpeg"],
    ["a.png", "image/png"],
    ["a.webp", "image/webp"],
    ["clip.mov", "video/quicktime"],
    ["a.jpg", ""],
    ["heic", ""],
    ["a.heic.png", "image/png"],
  ])("leaves %s sent with the type %j alone", (name, type) => {
    expect(isHeicFile({ name, type })).toBe(false);
  });

  it("never sends a file the browser labels as a JPEG through the HEIC decoder, whatever its name says", () => {
    expect(isHeicFile({ name: "IMG_0001.HEIC", type: "image/jpeg" })).toBe(false);
  });
});

describe("isAcceptedPhoto", () => {
  it.each([
    ["a.jpg", "image/jpeg"],
    ["a.png", "image/png"],
    ["a.webp", "image/webp"],
    ["a.heic", "image/heic"],
    ["a.HEIC", ""],
  ])("accepts %s sent with the type %j", (name, type) => {
    expect(isAcceptedPhoto({ name, type })).toBe(true);
  });

  it.each([
    ["a.gif", "image/gif"],
    ["a.pdf", "application/pdf"],
    ["clip.mp4", "video/mp4"],
    ["notes", ""],
  ])("rejects %s sent with the type %j", (name, type) => {
    expect(isAcceptedPhoto({ name, type })).toBe(false);
  });
});

describe("PHOTO_PICKER_ACCEPT", () => {
  it("lets a file picker choose HEIC by type and by extension, next to the existing photo types", () => {
    expect(PHOTO_PICKER_ACCEPT.split(",")).toEqual(
      expect.arrayContaining([
        "image/jpeg",
        "image/png",
        "image/webp",
        "image/heic",
        "image/heif",
        ".heic",
        ".heif",
      ])
    );
  });
});

describe("jpegFilename", () => {
  it.each([
    ["IMG_0001.HEIC", "IMG_0001.jpg"],
    ["IMG_0001.heic", "IMG_0001.jpg"],
    ["trip.2026.heif", "trip.2026.jpg"],
    ["photo", "photo.jpg"],
    [".heic", "photo.jpg"],
  ])("%s becomes %s", (name, expected) => {
    expect(jpegFilename(name)).toBe(expected);
  });
});

describe("prepareImageForUpload", () => {
  it.each([
    ["a.jpg", "image/jpeg"],
    ["a.png", "image/png"],
    ["a.webp", "image/webp"],
  ])("hands %s back untouched without calling the converter", async (name, type) => {
    const dropped = file(name, type);
    await expect(prepareImageForUpload(dropped)).resolves.toBe(dropped);
    expect(lib.heicTo).not.toHaveBeenCalled();
  });

  it("does not load the converter until a HEIC file arrives, and loads it once", async () => {
    vi.resetModules();
    lib.loaded.mockClear();
    const { prepareImageForUpload: prepare } = await import("./heic");

    await prepare(file("a.jpg", "image/jpeg"));
    await prepare(file("a.png", "image/png"));
    expect(lib.loaded).not.toHaveBeenCalled();

    lib.heicTo.mockResolvedValue(jpegBlob());
    await prepare(file("a.heic", "image/heic"));
    await prepare(file("b.heic", "image/heic"));
    expect(lib.loaded).toHaveBeenCalledTimes(1);
  });

  it("turns a HEIC into a JPEG file named .jpg, with the converter's bytes and an image/jpeg type", async () => {
    lib.heicTo.mockResolvedValue(jpegBlob());
    const dropped = file("IMG_0001.HEIC", "image/heic", new Uint8Array([1, 2, 3, 4]));

    const out = await prepareImageForUpload(dropped);

    expect(out).toBeInstanceOf(File);
    expect(out).not.toBe(dropped);
    expect(out.name).toBe("IMG_0001.jpg");
    expect(out.type).toBe("image/jpeg");
    expect(out.size).toBe(jpegBytes.length);
    expect(new Uint8Array(await out.arrayBuffer())).toEqual(jpegBytes);
  });

  it("converts a HEIC the browser gave no type, going by the extension", async () => {
    lib.heicTo.mockResolvedValue(jpegBlob());
    const out = await prepareImageForUpload(file("IMG_0002.HEIC", ""));
    expect(lib.heicTo).toHaveBeenCalledTimes(1);
    expect(out.name).toBe("IMG_0002.jpg");
    expect(out.type).toBe("image/jpeg");
  });

  it("asks the converter for a JPEG at quality 0.9, from the file as dropped", async () => {
    lib.heicTo.mockResolvedValue(jpegBlob());
    const dropped = file("IMG_0003.heic", "image/heif");
    await prepareImageForUpload(dropped);
    expect(lib.heicTo).toHaveBeenCalledWith({ blob: dropped, type: "image/jpeg", quality: 0.9 });
  });

  it("says when conversion starts, once, and only for a HEIC", async () => {
    lib.heicTo.mockResolvedValue(jpegBlob());
    const onConverting = vi.fn();

    await prepareImageForUpload(file("a.jpg", "image/jpeg"), { onConverting });
    expect(onConverting).not.toHaveBeenCalled();

    await prepareImageForUpload(file("a.heic", "image/heic"), { onConverting });
    expect(onConverting).toHaveBeenCalledTimes(1);
  });

  describe("when conversion fails", () => {
    it.each<[string, unknown]>([
      ["a string, which is what heic-to rejects with", "Error: HEIF image not found"],
      ["an Error", new Error("wasm abort")],
      ["a plain object, which is what heic2any rejects with", { code: 2, message: "ERR_LIBHEIF format not supported" }],
      ["nothing at all", undefined],
    ])("shows the iPhone message when the converter rejects with %s", async (_label, rejection) => {
      lib.heicTo.mockRejectedValue(rejection);
      const run = prepareImageForUpload(file("a.heic", "image/heic"));
      await expect(run).rejects.toBeInstanceOf(HeicConversionError);
      await expect(run).rejects.toThrow(HEIC_UNSUPPORTED_MESSAGE);
    });

    it("keeps the underlying cause for debugging", async () => {
      const cause = new Error("wasm abort");
      lib.heicTo.mockRejectedValue(cause);
      const error = await prepareImageForUpload(file("a.heic", "image/heic")).catch((e: unknown) => e);
      expect((error as HeicConversionError).cause).toBe(cause);
    });

    it("refuses a result that is not a JPEG instead of labelling it as one", async () => {
      lib.heicTo.mockResolvedValue(new Blob([jpegBytes], { type: "image/png" }));
      await expect(prepareImageForUpload(file("a.heic", "image/heic"))).rejects.toBeInstanceOf(HeicConversionError);
    });

    it("refuses an empty result", async () => {
      lib.heicTo.mockResolvedValue(new Blob([], { type: "image/jpeg" }));
      await expect(prepareImageForUpload(file("a.heic", "image/heic"))).rejects.toBeInstanceOf(HeicConversionError);
    });
  });

  describe("the 25 MB photo limit", () => {
    it("applies to the converted JPEG: a small HEIC that converts to more than the limit is refused", async () => {
      lib.heicTo.mockResolvedValue(jpegBlob(new Uint8Array(Math.floor(26.4 * 1024 * 1024))));
      const run = prepareImageForUpload(file("a.heic", "image/heic"));
      await expect(run).rejects.toThrow("Too large once converted to JPEG (26.4 MB). Max 25 MB.");
      await expect(run).rejects.not.toBeInstanceOf(HeicConversionError);
    });

    it("does not apply to the HEIC as dropped: one over the limit is fine if its JPEG is under it", async () => {
      lib.heicTo.mockResolvedValue(jpegBlob());
      const big = file("pano.heic", "image/heic", new Uint8Array(MAX_PHOTO_BYTES + 1));
      await expect(prepareImageForUpload(big)).resolves.toBeInstanceOf(File);
    });

    it("accepts a JPEG of exactly the limit", async () => {
      lib.heicTo.mockResolvedValue(jpegBlob(new Uint8Array(MAX_PHOTO_BYTES)));
      const out = await prepareImageForUpload(file("a.heic", "image/heic"));
      expect(out.size).toBe(MAX_PHOTO_BYTES);
    });
  });
});
