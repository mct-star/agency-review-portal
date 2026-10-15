import type { createAdminSupabaseClient } from "@/lib/supabase/admin";
import type { PostTypeOption } from "@/lib/constants/post-types";
import { selectImages, type ImageWant, type LibraryCandidate } from "@/lib/media/select-images";
import { CAPTURES_BUCKET } from "@/lib/upload/media-constants";

type Supabase = Awaited<ReturnType<typeof createAdminSupabaseClient>>;

export interface PhotoSuggestion {
  id: string;
  /** One-hour signed thumbnail, never the original. */
  thumbUrl: string | null;
  label: string | null;
}

/**
 * What a post wants from the library, from its post type's library query.
 * The weather post also asks for the day's weather tags, best first.
 */
export function wantFor(postType: PostTypeOption | undefined, weatherTags: string[] = []): ImageWant {
  const q = postType?.libraryQuery;
  if (!q) return { avoidPeople: true };
  return {
    weather: q.matchWeather ? weatherTags : undefined,
    place: q.place,
    subject: q.subject,
    avoidPeople: q.avoidPeople,
  };
}

type Row = LibraryCandidate & { thumb_path: string | null; scene_label: string | null };

/**
 * Up to `count` approved photos from the company's library that suit the
 * post, best first, read from the tags the library gave each photo. Empty
 * when the library has nothing approved.
 */
export async function suggestPhotos(
  supabase: Supabase,
  companyId: string,
  want: ImageWant,
  count = 3,
  excludeIds: string[] = []
): Promise<PhotoSuggestion[]> {
  const { data, error } = await supabase
    .from("photo_inventory")
    .select("id, kind, tags, people_present, last_used_at, used_in_weeks, status, thumb_path, scene_label")
    .eq("company_id", companyId)
    .eq("status", "approved")
    .eq("kind", "photo")
    .limit(2000);
  if (error) throw new Error(`Could not read the library: ${error.message}`);
  const rows = (data || []) as Row[];
  if (rows.length === 0) return [];

  const picks = selectImages(rows, want, { count, excludeIds });
  const paths = picks.map((p) => p.thumb_path).filter((p): p is string => !!p);
  const signed = new Map<string, string>();
  if (paths.length > 0) {
    const { data: urls } = await supabase.storage.from(CAPTURES_BUCKET).createSignedUrls(paths, 3600);
    for (const u of urls || []) if (u.path && u.signedUrl) signed.set(u.path, u.signedUrl);
  }
  return picks.map((p) => ({ id: p.id, thumbUrl: p.thumb_path ? signed.get(p.thumb_path) ?? null : null, label: p.scene_label }));
}
