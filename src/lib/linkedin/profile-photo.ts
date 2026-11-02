/**
 * Copies the connecting person's LinkedIn photo into our own storage.
 *
 * LinkedIn's picture URLs expire, so the URL kept in platform_metadata is not
 * durable. This is best effort after a successful connection and never throws.
 * It never overwrites a photo that is already set, and never scrapes LinkedIn:
 * the picture comes from the OpenID profile the person just authorised.
 */
import { createHash } from "node:crypto";
import sharp from "sharp";
import type { createAdminSupabaseClient } from "@/lib/supabase/admin";

type Db = Awaited<ReturnType<typeof createAdminSupabaseClient>>;

const PHOTO_BYTES_LIMIT = 5 * 1024 * 1024;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

/** LinkedIn's media hosts. Anything else is refused. */
export function isLinkedInMediaUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const u = new URL(value);
    return u.protocol === "https:" && (u.hostname === "media.licdn.com" || /^media-exp\d+\.licdn\.com$/.test(u.hostname));
  } catch {
    return false;
  }
}

interface PersonRow { id: string; name: string | null; profile_picture_url: string | null }
const blank = (value: string | null | undefined) => !value || !value.trim();

/** Exact case-insensitive name match, else the only spokesperson the company has. */
export function pickSpokesperson(rows: PersonRow[], profileName: string | undefined): PersonRow | null {
  const wanted = profileName?.trim().toLowerCase();
  if (wanted) {
    const matches = rows.filter((row) => row.name?.trim().toLowerCase() === wanted);
    if (matches.length === 1) return matches[0];
    if (matches.length > 1) return null;
  }
  return rows.length === 1 ? rows[0] : null;
}

async function downloadPicture(url: string): Promise<Buffer | null> {
  const res = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(6_000) });
  if (!res.ok) return null;
  const type = (res.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  if (!ALLOWED_TYPES.includes(type)) return null;
  if (Number(res.headers.get("content-length") || 0) > PHOTO_BYTES_LIMIT) return null;
  const bytes = Buffer.from(await res.arrayBuffer());
  return bytes.length > PHOTO_BYTES_LIMIT ? null : bytes;
}

export async function saveLinkedInPhoto(
  db: Db,
  companyId: string,
  profile: { name?: string; picture?: string },
): Promise<"saved" | "skipped"> {
  try {
    if (!isLinkedInMediaUrl(profile.picture)) return "skipped";
    const { data, error } = await db.from("company_spokespersons").select("id, name, profile_picture_url").eq("company_id", companyId);
    if (error || !data) return "skipped";
    const person = pickSpokesperson(data as PersonRow[], profile.name);
    if (!person || !blank(person.profile_picture_url)) return "skipped";

    const bytes = await downloadPicture(profile.picture);
    if (!bytes) return "skipped";
    // Decoding proves it is an image; re-encoding strips metadata and fixes the size.
    const jpeg = await sharp(bytes).rotate().resize(512, 512, { fit: "cover", position: "centre" }).jpeg({ quality: 88 }).toBuffer();
    const path = `images/${companyId}/people/${person.id}-${createHash("sha256").update(jpeg).digest("hex").slice(0, 16)}.jpg`;
    const { error: uploadError } = await db.storage.from("content-assets").upload(path, jpeg, { contentType: "image/jpeg", upsert: false, cacheControl: "31536000" });
    if (uploadError && !/already exists|duplicate/i.test(uploadError.message)) return "skipped";
    const publicUrl = db.storage.from("content-assets").getPublicUrl(path).data.publicUrl;

    // The update itself refuses a row that gained a photo in the meantime.
    let update = db.from("company_spokespersons").update({ profile_picture_url: publicUrl }).eq("id", person.id).eq("company_id", companyId);
    update = person.profile_picture_url === null ? update.is("profile_picture_url", null) : update.eq("profile_picture_url", person.profile_picture_url);
    const { data: updated, error: updateError } = await update.select("id").maybeSingle();
    return !updateError && updated ? "saved" : "skipped";
  } catch (err) {
    console.error("[LinkedIn OAuth] photo copy skipped:", err instanceof Error ? err.message : err);
    return "skipped";
  }
}
