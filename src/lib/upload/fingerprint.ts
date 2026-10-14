/**
 * A content fingerprint for duplicate detection.
 *
 * Files up to 100 MB are hashed whole (SHA-256). A larger video cannot be
 * held in memory at once, so it is fingerprinted from its size and three
 * 4 MB slices (start, middle, end). Two different clips that agree on all of
 * that are not a realistic concern. Either way the result is 64 hex
 * characters and is stored as file_ref "sha256:<hex>".
 */

const WHOLE_FILE_LIMIT = 100 * 1024 * 1024;
const SLICE = 4 * 1024 * 1024;

async function digestHex(parts: ArrayBuffer[]): Promise<string | null> {
  // crypto.subtle only exists in a secure context. Without it the upload
  // still works and the server falls back to the storage path as its key.
  if (typeof crypto === "undefined" || !crypto.subtle) return null;
  const total = parts.reduce((n, p) => n + p.byteLength, 0);
  const all = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) {
    all.set(new Uint8Array(p), offset);
    offset += p.byteLength;
  }
  const digest = await crypto.subtle.digest("SHA-256", all);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function fingerprintFile(file: Blob): Promise<string | null> {
  if (file.size <= WHOLE_FILE_LIMIT) return digestHex([await file.arrayBuffer()]);
  const size = new TextEncoder().encode(`size:${file.size}`).buffer as ArrayBuffer;
  const mid = Math.floor(file.size / 2) - SLICE / 2;
  return digestHex([
    size,
    await file.slice(0, SLICE).arrayBuffer(),
    await file.slice(mid, mid + SLICE).arrayBuffer(),
    await file.slice(file.size - SLICE).arrayBuffer(),
  ]);
}
