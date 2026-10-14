/**
 * Whether a URL points at this project's own Supabase storage.
 *
 * The publishing routes fetch an image by URL on the server before uploading
 * it to LinkedIn or Bluesky. Only our own storage is fetched, so a caller
 * cannot use the server to read an arbitrary address.
 */
export function isOurStorageUrl(url: unknown, supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL): boolean {
  if (typeof url !== "string" || !supabaseUrl) return false;
  try {
    const u = new URL(url);
    const base = new URL(supabaseUrl);
    return u.protocol === "https:" && u.host === base.host && u.pathname.startsWith("/storage/v1/object/");
  } catch {
    return false;
  }
}
