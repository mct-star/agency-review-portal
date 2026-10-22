import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";
import { fakeSupabase } from "@/test/fake-supabase";
import { autoTagItem, derivedPath, registerLibraryItem, type LibraryDeps } from "./library";

const COMPANY = "11111111-1111-4111-8111-111111111111";

async function jpeg() {
  return sharp({ create: { width: 1600, height: 1200, channels: 3, background: { r: 10, g: 140, b: 60 } } }).jpeg().toBuffer();
}

function deps(over: Partial<LibraryDeps> = {}): LibraryDeps & { uploads: string[] } {
  const uploads: string[] = [];
  return {
    uploads,
    download: vi.fn(async () => jpeg()),
    upload: vi.fn(async (_b, p) => void uploads.push(p)),
    tag: vi.fn(async () => ({
      tags: ["weather:sunny", "place:deck"],
      people_present: false,
      text_space: true,
      scene_label: "A sunny deck.",
      provider: "claude" as const,
    })),
    ...over,
  };
}

const base = {
  companyId: COMPANY,
  kind: "photo" as const,
  path: `${COMPANY}/photos/20261014_1_deck.jpg`,
  mimeType: "image/jpeg",
  sizeBytes: 1000,
  originalFilename: "deck.jpg",
  sha256: "a".repeat(64),
  width: null,
  height: null,
  durationSeconds: null,
  source: "bank_upload" as const,
  status: "approved" as const,
};

describe("registerLibraryItem", () => {
  it("writes a thumbnail beside the original and records its path", async () => {
    const fake = fakeSupabase({ photo_inventory: { data: { id: "row1", storage_path: base.path } } });
    const d = deps();
    const r = await registerLibraryItem(fake.client as never, base, d);
    expect(r.alreadyExists).toBe(false);
    expect(d.uploads).toEqual([`${COMPANY}/thumbs/20261014_1_deck.jpg`]);
    expect(r.visionImages).toHaveLength(1);
    const update = fake.calls.find((c) => c.method === "update");
    expect(update?.args[0]).toMatchObject({ thumb_path: `${COMPANY}/thumbs/20261014_1_deck.jpg`, width: 1600, height: 1200 });
  });

  it("reports an already-held file and removes the duplicate it just received", async () => {
    let call = 0;
    const fake = fakeSupabase({
      photo_inventory: () => {
        call += 1;
        return call === 1
          ? { data: null, error: { message: "duplicate", code: "23505" } }
          : { data: { id: "old", storage_path: `${COMPANY}/photos/older.jpg` } };
      },
    });
    const r = await registerLibraryItem(fake.client as never, base, deps());
    expect(r.alreadyExists).toBe(true);
    expect(fake.storageCalls.some((c) => c.method === "remove")).toBe(true);
  });

  it("keeps the upload when the thumbnail cannot be made", async () => {
    const fake = fakeSupabase({ photo_inventory: { data: { id: "row1" } } });
    const d = deps({ download: vi.fn(async () => { throw new Error("storage down"); }) });
    const r = await registerLibraryItem(fake.client as never, base, d);
    expect(r.alreadyExists).toBe(false);
    expect(r.photo).toMatchObject({ id: "row1" });
  });

  it("makes a poster from the frames of a video", async () => {
    const fake = fakeSupabase({ photo_inventory: { data: { id: "v1" } } });
    const d = deps();
    const frame = await jpeg();
    const r = await registerLibraryItem(
      fake.client as never,
      { ...base, kind: "video", mimeType: "video/mp4", path: `${COMPANY}/videos/clip.mp4`, frames: [frame, frame, frame] },
      d
    );
    expect(d.uploads).toEqual([`${COMPANY}/posters/clip.jpg`]);
    expect(r.visionImages).toHaveLength(3);
  });
});

describe("autoTagItem", () => {
  const row = { id: "row1", company_id: COMPANY, kind: "photo", bucket: "captures", storage_path: base.path, poster_path: null, tags: ["birthday"], scene_label: null };

  it("writes vocabulary tags, keeps hand-written ones, and fills the scene sentence", async () => {
    const fake = fakeSupabase({ photo_inventory: { data: row }, companies: { data: { name: "Lakeside", industry: "hospitality", description: null } } });
    const d = deps();
    const r = await autoTagItem(fake.client as never, "row1", { deps: d });
    expect(r.ok).toBe(true);
    expect(d.tag).toHaveBeenCalledWith(expect.any(Array), { companyId: COMPANY, venueContext: "Lakeside. hospitality" });
    const update = fake.calls.filter((c) => c.method === "update").pop()!.args[0] as Record<string, unknown>;
    expect(update.tags).toEqual(["birthday", "weather:sunny", "place:deck"]);
    expect(update.scene_label).toBe("A sunny deck.");
    expect(update.people_present).toBe(false);
    expect(update.auto_tag_error).toBeNull();
  });

  it("never overwrites a scene sentence a person wrote", async () => {
    const fake = fakeSupabase({ photo_inventory: { data: { ...row, scene_label: "Mine" } }, companies: { data: null } });
    await autoTagItem(fake.client as never, "row1", { deps: deps() });
    const update = fake.calls.filter((c) => c.method === "update").pop()!.args[0] as Record<string, unknown>;
    expect("scene_label" in update).toBe(false);
  });

  it("records the failure on the row so it can be retried, and loses nothing", async () => {
    const fake = fakeSupabase({ photo_inventory: { data: row }, companies: { data: null } });
    const d = deps({ tag: vi.fn(async () => { throw new Error("Tagging failed: Gemini 503"); }) });
    const r = await autoTagItem(fake.client as never, "row1", { deps: d });
    expect(r.ok).toBe(false);
    const update = fake.calls.filter((c) => c.method === "update").pop()!.args[0] as Record<string, unknown>;
    expect(update.auto_tag_error).toMatch(/Gemini 503/);
    expect("tags" in update).toBe(false);
  });

  it("tags a video from its poster when no frames are in hand", async () => {
    const fake = fakeSupabase({ photo_inventory: { data: { ...row, kind: "video", storage_path: `${COMPANY}/videos/c.mp4`, poster_path: `${COMPANY}/posters/c.jpg` } }, companies: { data: null } });
    const d = deps();
    await autoTagItem(fake.client as never, "row1", { deps: d });
    expect(d.download).toHaveBeenCalledWith("captures", `${COMPANY}/posters/c.jpg`);
  });
});

describe("derivedPath", () => {
  it("sits beside the original under the company folder", () => {
    expect(derivedPath(COMPANY, "thumbs", `${COMPANY}/photos/a.b.jpeg`)).toBe(`${COMPANY}/thumbs/a.b.jpg`);
  });
});
