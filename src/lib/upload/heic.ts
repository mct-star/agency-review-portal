import {
  HEIC_EXTENSIONS,
  HEIC_MIME_TYPES,
  HEIC_UNSUPPORTED_MESSAGE,
  MAX_PHOTO_BYTES,
  PHOTO_MIME_TYPES,
} from "./media-constants";

/**
 * HEIC and HEIF photos, converted to JPEG in the browser before upload.
 *
 * An iPhone shoots HEIC by default and the bucket only takes JPEG, PNG and
 * WebP, so every browser-direct photo upload (the bank, the Week Board
 * dropzone, a post's Upload Photo) calls prepareImageForUpload first and
 * then uploads, hashes and registers the file it gets back. That keeps the
 * sha256 that register stores as file_ref describing the object actually in
 * storage. Nothing but JPEG, PNG and WebP reaches the sign route.
 *
 * The converter is libheif compiled to wasm, so it is imported only inside
 * prepareImageForUpload and only for a HEIC file. Everyone else never
 * downloads it.
 */

const JPEG_QUALITY = 0.9;

// Types a browser sends when it does not know what a file is.
const UNTYPED = ["", "application/octet-stream", "binary/octet-stream"];

/** For the accept attribute of a photo file input, so a picker offers HEIC files too. */
export const PHOTO_PICKER_ACCEPT = [
  ...PHOTO_MIME_TYPES,
  "image/heic",
  "image/heif",
  ...HEIC_EXTENSIONS,
].join(",");

/** What the caller sees when a HEIC cannot be converted: the message that says what to change on the phone. */
export class HeicConversionError extends Error {
  constructor(cause?: unknown) {
    super(HEIC_UNSUPPORTED_MESSAGE, { cause });
    this.name = "HeicConversionError";
  }
}

function baseType(type: string): string {
  return type.split(";")[0].trim().toLowerCase();
}

function heicExtensionOf(name: string): string | undefined {
  const lower = name.toLowerCase();
  return HEIC_EXTENSIONS.find((ext) => lower.endsWith(ext));
}

/**
 * By MIME type, or by extension when the browser gave an empty or generic
 * type. A file the browser has labelled as something specific, a JPEG say,
 * is never sent through the HEIC decoder, whatever its name says.
 */
export function isHeicFile(file: { name: string; type: string }): boolean {
  const type = baseType(file.type);
  if (HEIC_MIME_TYPES.includes(type)) return true;
  return UNTYPED.includes(type) && heicExtensionOf(file.name) !== undefined;
}

export function isAcceptedPhoto(file: { name: string; type: string }): boolean {
  return PHOTO_MIME_TYPES.includes(file.type) || isHeicFile(file);
}

export function jpegFilename(name: string): string {
  const ext = heicExtensionOf(name);
  const base = ext ? name.slice(0, name.length - ext.length) : name;
  return `${base || "photo"}.jpg`;
}

function megabytes(bytes: number, digits = 1): string {
  return (bytes / 1024 / 1024).toFixed(digits);
}

export interface PrepareImageOptions {
  /** Called once, just before a HEIC file starts converting. Never called for any other file. */
  onConverting?: () => void;
}

/**
 * A JPEG, PNG or WebP comes back as the same File object, untouched. A HEIC
 * comes back as an upright JPEG File with a .jpg name. The converter bakes
 * the rotation and mirroring into the pixels and writes no EXIF, so nothing
 * downstream can turn it sideways.
 *
 * Throws HeicConversionError (the iPhone message) when conversion fails, and
 * a plain Error with the size when the JPEG is over the photo limit. The
 * limit is checked here against the converted file, not the HEIC as dropped.
 */
export async function prepareImageForUpload(
  file: File,
  options: PrepareImageOptions = {}
): Promise<File> {
  if (!isHeicFile(file)) return file;

  options.onConverting?.();

  let converted: Blob;
  try {
    const { heicTo } = await import("heic-to");
    converted = await heicTo({ blob: file, type: "image/jpeg", quality: JPEG_QUALITY });
  } catch (cause) {
    // The converter rejects with a bare string, an object or an Error
    // depending on the failure, so nothing about the rejection is relied on.
    throw new HeicConversionError(cause);
  }

  // canvas.toBlob quietly falls back to PNG when it cannot encode JPEG.
  // Never label that as a JPEG.
  if (converted.type !== "image/jpeg" || converted.size === 0) {
    throw new HeicConversionError();
  }

  if (converted.size > MAX_PHOTO_BYTES) {
    throw new Error(
      `Too large once converted to JPEG (${megabytes(converted.size)} MB). Max ${megabytes(MAX_PHOTO_BYTES, 0)} MB.`
    );
  }

  return new File([converted], jpegFilename(file.name), {
    type: "image/jpeg",
    lastModified: file.lastModified,
  });
}
