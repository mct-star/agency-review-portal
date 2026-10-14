/**
 * Where a resumable (TUS) upload with a signed token is sent.
 *
 * Supabase Storage serves the signed variant of the resumable endpoint at
 * `<tusPath>/sign` and takes the token from an `x-signature` header, with no
 * user session needed (confirmed against the storage server's own source and
 * its test for signed uploads). Hosted projects also have a direct storage
 * hostname that is faster for large files; anything else uses the normal
 * API host.
 */
export function tusEndpointFor(supabaseUrl: string): string {
  const root = supabaseUrl.replace(/\/+$/, "");
  const hosted = /^https:\/\/([a-z0-9]{20})\.supabase\.co$/.exec(root);
  const base = hosted ? `https://${hosted[1]}.storage.supabase.co` : root;
  return `${base}/storage/v1/upload/resumable/sign`;
}

/** Supabase requires exactly 6 MB chunks for resumable uploads. */
export const TUS_CHUNK_BYTES = 6 * 1024 * 1024;

/** Videos at or above this size go through the resumable endpoint. */
export const RESUMABLE_THRESHOLD_BYTES = 12 * 1024 * 1024;
