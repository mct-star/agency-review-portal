/**
 * Who a profile statement card is "by", and their photo.
 *
 * The header is always the post's own author: never another person's name or
 * face. Every query filters on company_id (the service-role client bypasses
 * RLS). Satori never fetches a remote URL: only our own storage is downloaded,
 * here, and the bytes are handed over as a data URI.
 */
import sharp from "sharp";
import { isOurStorageUrl } from "@/lib/media/our-storage-url";
import type { ProductionDb } from "./types";

export const NO_PHOTO_MESSAGE = "A profile statement needs the author's photo. Add one under Setup, People, then try again.";
export const NO_NAME_MESSAGE = "A profile statement needs the author's name. Add the person under Setup, People, then try again.";
const PHOTO_BYTES_LIMIT = 5 * 1024 * 1024;

export interface ProfileAuthor {
  /** The company_spokespersons row, or null when the author comes from the company record. */
  spokespersonId: string | null;
  name: string;
  tagline: string | null;
  /** Always one of our own storage URLs. */
  photoUrl: string;
}

interface SpokespersonRow { id: string; name: string | null; tagline: string | null; profile_picture_url: string | null }
const PERSON_COLUMNS = "id, name, tagline, profile_picture_url";
const sameName = (a?: string | null, b?: string | null) => !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * content_pieces.spokesperson_id if set, else the company's primary
 * spokesperson, else the company record. The name and the face always come
 * from the same person.
 */
export async function resolveProfileAuthor(db: ProductionDb, companyId: string, pieceId?: string): Promise<Omit<ProfileAuthor, "photoUrl"> & { photoUrl: string | null }> {
  let person: SpokespersonRow | null = null;
  let requestedId: string | null = null;
  if (pieceId) {
    const { data, error } = await db.from("content_pieces").select("spokesperson_id").eq("id", pieceId).eq("company_id", companyId).maybeSingle();
    if (error) throw new Error("Could not check who wrote this post.");
    requestedId = (data as { spokesperson_id?: string | null } | null)?.spokesperson_id ?? null;
  }
  if (requestedId) {
    const { data, error } = await db.from("company_spokespersons").select(PERSON_COLUMNS).eq("id", requestedId).eq("company_id", companyId).maybeSingle();
    if (error) throw new Error("Could not read the post's author.");
    if (!data) throw new Error("The post's author was not found for this company. Choose an author under Setup, People.");
    person = data as SpokespersonRow;
  } else {
    const { data, error } = await db.from("company_spokespersons").select(PERSON_COLUMNS).eq("company_id", companyId).eq("is_primary", true).order("sort_order").limit(1).maybeSingle();
    if (error) throw new Error("Could not read the company's primary person.");
    person = (data as SpokespersonRow | null) ?? null;
  }

  let name = person?.name?.trim() || null;
  let photoUrl = person?.profile_picture_url?.trim() || null;
  if (!person || !photoUrl) {
    const { data, error } = await db.from("companies").select("profile_picture_url, spokesperson_name").eq("id", companyId).maybeSingle();
    if (error) throw new Error("Could not read the company's profile photo.");
    const company = data as { profile_picture_url: string | null; spokesperson_name: string | null } | null;
    // The company photo is only borrowed when it is plainly the same person.
    if (company && (!person || sameName(person.name, company.spokesperson_name))) {
      name = name || company.spokesperson_name?.trim() || null;
      photoUrl = photoUrl || company.profile_picture_url?.trim() || null;
    }
  }
  if (!name) throw new Error(NO_NAME_MESSAGE);
  return { spokespersonId: person?.id ?? null, name, tagline: person?.tagline?.trim() || null, photoUrl };
}

/** Resolves the author and refuses unless there is a usable photo. Call it before any paid writing. */
export async function requireProfileAuthor(db: ProductionDb, companyId: string, pieceId?: string): Promise<ProfileAuthor> {
  const author = await resolveProfileAuthor(db, companyId, pieceId);
  if (!author.photoUrl || !isOurStorageUrl(author.photoUrl)) throw new Error(NO_PHOTO_MESSAGE);
  return { ...author, photoUrl: author.photoUrl };
}

/** Downloads one of our own photos, crops it to a 240 pixel square and returns a data URI. */
export async function loadProfilePhoto(url: string): Promise<string> {
  if (!isOurStorageUrl(url)) throw new Error(NO_PHOTO_MESSAGE);
  let bytes: Buffer;
  try {
    const res = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(`status ${res.status}`);
    if (!/^image\//i.test(res.headers.get("content-type") || "")) throw new Error("not an image");
    const declared = Number(res.headers.get("content-length") || 0);
    if (declared > PHOTO_BYTES_LIMIT) throw new Error("too large");
    bytes = Buffer.from(await res.arrayBuffer());
    if (bytes.length > PHOTO_BYTES_LIMIT) throw new Error("too large");
  } catch {
    throw new Error("The author's photo could not be read. Upload it again under Setup, People, then try again.");
  }
  try {
    const square = await sharp(bytes).rotate().resize(240, 240, { fit: "cover", position: "centre" }).png().toBuffer();
    return `data:image/png;base64,${square.toString("base64")}`;
  } catch {
    throw new Error("The author's photo is not a usable image. Upload it again under Setup, People, then try again.");
  }
}
