import { beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { isLinkedInMediaUrl, pickSpokesperson, saveLinkedInPhoto } from "./profile-photo";

type Row = { id: string; name: string | null; profile_picture_url: string | null };
const PICTURE = "https://media.licdn.com/dms/image/v2/abc/profile-displayphoto-shrink_800_800/0/1?e=1&t=x";

function fakeDb(people: Row[], opts: { updateRows?: number } = {}) {
  const uploads: string[] = [];
  const updates: Array<{ patch: unknown; filters: string[] }> = [];
  const db = {
    from() {
      let patch: unknown = null;
      const filters: string[] = [];
      const q: Record<string, unknown> = {};
      q.select = () => q;
      q.update = (p: unknown) => { patch = p; return q; };
      q.eq = (k: string, v: unknown) => { filters.push(`${k}=${String(v)}`); return q; };
      q.is = (k: string, v: unknown) => { filters.push(`${k} is ${String(v)}`); return q; };
      q.maybeSingle = async () => { updates.push({ patch, filters }); return { data: (opts.updateRows ?? 1) ? { id: "x" } : null, error: null }; };
      q.then = (resolve: (v: unknown) => unknown) => Promise.resolve({ data: people, error: null }).then(resolve);
      return q;
    },
    storage: { from: () => ({
      upload: async (path: string) => { uploads.push(path); return { error: null }; },
      getPublicUrl: (path: string) => ({ data: { publicUrl: `https://proj.supabase.co/storage/v1/object/public/content-assets/${path}` } }),
    }) },
  };
  return { db: db as never, uploads, updates };
}
async function jpeg() {
  const bytes = await sharp({ create: { width: 300, height: 200, channels: 3, background: "#778899" } }).jpeg().toBuffer();
  return new Response(new Uint8Array(bytes), { headers: { "content-type": "image/jpeg" } });
}

beforeEach(() => vi.restoreAllMocks());

describe("LinkedIn photo host allowlist", () => {
  it("accepts LinkedIn media hosts only", () => {
    expect(isLinkedInMediaUrl(PICTURE)).toBe(true);
    for (const url of ["http://media.licdn.com/a.jpg", "https://licdn.com.evil.example/a.jpg", "https://evil.example/media.licdn.com/a.jpg", "https://www.linkedin.com/a.jpg", "https://169.254.169.254/a.jpg", undefined]) {
      expect(isLinkedInMediaUrl(url), String(url)).toBe(false);
    }
  });
});

describe("matching the connecting person", () => {
  const rows: Row[] = [{ id: "1", name: "Michael Colling-Tuck", profile_picture_url: null }, { id: "2", name: "Sam", profile_picture_url: null }];
  it("matches the exact name, ignoring case", () => expect(pickSpokesperson(rows, "michael colling-tuck")?.id).toBe("1"));
  it("does not guess among several people", () => expect(pickSpokesperson(rows, "Someone Else")).toBeNull());
  it("uses a sole spokesperson when the name differs", () => expect(pickSpokesperson([rows[1]], "Samuel Jones")?.id).toBe("2"));
});

describe("saving the photo", () => {
  it("copies the picture to our storage for the matching person with no photo", async () => {
    const f = fakeDb([{ id: "p1", name: "Michael Colling-Tuck", profile_picture_url: null }]);
    const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(async () => jpeg());
    expect(await saveLinkedInPhoto(f.db, "company-a", { name: "Michael Colling-Tuck", picture: PICTURE })).toBe("saved");
    expect(fetch).toHaveBeenCalledWith(PICTURE, expect.objectContaining({ redirect: "manual" }));
    expect(f.uploads[0]).toMatch(/^images\/company-a\/people\/p1-[a-f0-9]+\.jpg$/);
    expect(f.updates[0].filters).toEqual(expect.arrayContaining(["id=p1", "company_id=company-a", "profile_picture_url is null"]));
    expect(f.updates[0].patch).toMatchObject({ profile_picture_url: expect.stringContaining("/content-assets/images/company-a/people/") });
  });

  it("never overwrites an existing photo, and does not even download", async () => {
    const f = fakeDb([{ id: "p1", name: "Michael Colling-Tuck", profile_picture_url: "https://proj.supabase.co/storage/v1/object/public/media/logos/c/profile.png" }]);
    const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(async () => jpeg());
    expect(await saveLinkedInPhoto(f.db, "company-a", { name: "Michael Colling-Tuck", picture: PICTURE })).toBe("skipped");
    expect(fetch).not.toHaveBeenCalled();
    expect(f.uploads).toHaveLength(0);
    expect(f.updates).toHaveLength(0);
  });

  it("does not overwrite a photo added while the download was running", async () => {
    const f = fakeDb([{ id: "p1", name: "Michael Colling-Tuck", profile_picture_url: null }], { updateRows: 0 });
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => jpeg());
    expect(await saveLinkedInPhoto(f.db, "company-a", { name: "Michael Colling-Tuck", picture: PICTURE })).toBe("skipped");
  });

  it("skips a non-LinkedIn host without fetching", async () => {
    const f = fakeDb([{ id: "p1", name: "Michael Colling-Tuck", profile_picture_url: null }]);
    const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(async () => jpeg());
    expect(await saveLinkedInPhoto(f.db, "company-a", { name: "Michael Colling-Tuck", picture: "https://evil.example/a.jpg" })).toBe("skipped");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("skips a non-image, an oversized file and a failed download, and never throws", async () => {
    const f = fakeDb([{ id: "p1", name: "Michael Colling-Tuck", profile_picture_url: null }]);
    const spy = vi.spyOn(globalThis, "fetch");
    spy.mockResolvedValueOnce(new Response("<html>", { headers: { "content-type": "text/html" } }));
    spy.mockResolvedValueOnce(new Response("x", { headers: { "content-type": "image/jpeg", "content-length": String(6 * 1024 * 1024) } }));
    spy.mockResolvedValueOnce(new Response("not an image", { headers: { "content-type": "image/jpeg" } }));
    spy.mockRejectedValueOnce(new Error("network down"));
    for (let i = 0; i < 4; i += 1) expect(await saveLinkedInPhoto(f.db, "company-a", { name: "Michael Colling-Tuck", picture: PICTURE })).toBe("skipped");
    expect(f.uploads).toHaveLength(0);
  });
});
