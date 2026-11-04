import { afterEach, describe, expect, it, vi } from "vitest";
import { attachLibraryItemToPiece } from "./attach";

const clip = {
  id: "clip",
  company_id: "co",
  kind: "video",
  bucket: "captures",
  storage_path: "co/clips/talk.mp4",
  poster_path: "co/posters/talk.jpg",
  mime_type: "video/mp4",
  duration_seconds: 42,
  original_filename: "talk.mp4",
  scene_label: "Talk",
  status: "approved",
  used_in_weeks: [],
};

function fakeSupabase(item: Record<string, unknown>, failPoster = false) {
  const inserted: Record<string, unknown>[] = [];
  const copied: { from: string; to: string; bucket?: string }[] = [];
  const supabase = {
    from: (table: string) => {
      const q: Record<string, unknown> = {
        select: () => q,
        eq: () => q,
        update: () => q,
        maybeSingle: async () => ({ data: table === "photo_inventory" ? item : { id: "piece", company_id: "co" } }),
        insert: async (row: Record<string, unknown>) => {
          inserted.push(row);
          return { error: null };
        },
        then: (resolve: (v: unknown) => void) => resolve({ error: null }),
      };
      return q;
    },
    storage: {
      from: () => ({
        copy: async (from: string, to: string, opts: { destinationBucket: string }) => {
          copied.push({ from, to, bucket: opts.destinationBucket });
          return { error: failPoster && from.includes("posters") ? { message: "boom" } : null };
        },
        download: async () => ({ data: null, error: { message: "gone" } }),
        getPublicUrl: (path: string) => ({ data: { publicUrl: `https://public.test/${path}` } }),
      }),
    },
  };
  return { supabase: supabase as never, inserted, copied };
}

describe("attaching a bank clip", () => {
  afterEach(() => vi.restoreAllMocks());

  it("publishes the poster and stores it as the video's thumbnail", async () => {
    const { supabase, inserted, copied } = fakeSupabase(clip);
    await attachLibraryItemToPiece(supabase, "clip", "piece");
    expect(copied).toContainEqual({
      from: "co/posters/talk.jpg",
      to: "images/co/piece/poster-talk.jpg",
      bucket: "content-assets",
    });
    expect(inserted[0].asset_metadata).toMatchObject({
      type: "rendered_video",
      thumbnailUrl: "https://public.test/images/co/piece/poster-talk.jpg",
    });
  });

  it("still attaches a clip that has no poster, with no thumbnail recorded", async () => {
    const { supabase, inserted, copied } = fakeSupabase({ ...clip, poster_path: null });
    await attachLibraryItemToPiece(supabase, "clip", "piece");
    expect(copied).toHaveLength(1);
    expect(Object.keys(inserted[0].asset_metadata as object)).not.toContain("thumbnailUrl");
  });

  it("keeps the attach when the poster copy fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { supabase, inserted } = fakeSupabase(clip, true);
    await attachLibraryItemToPiece(supabase, "clip", "piece");
    expect(inserted).toHaveLength(1);
    expect(Object.keys(inserted[0].asset_metadata as object)).not.toContain("thumbnailUrl");
  });
});
