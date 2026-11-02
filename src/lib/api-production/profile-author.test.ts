import { beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import type { ProductionDb } from "./types";
import { loadProfilePhoto, NO_NAME_MESSAGE, NO_PHOTO_MESSAGE, requireProfileAuthor, resolveProfileAuthor } from "./profile-author";

const PHOTO = (who: string) => `https://proj.supabase.co/storage/v1/object/public/content-assets/images/${who}/people/a.png`;
type Row = Record<string, unknown>;

/** A tiny filter-honouring fake, so a missing company_id filter returns the wrong tenant's row. */
function fake(tables: Record<string, Row[]>) {
  const seen: Array<{ table: string; filters: string[] }> = [];
  const db = { from(table: string) {
    const filters: Array<[string, unknown]> = [];
    const q: Record<string, unknown> = {};
    q.select = () => q;
    q.eq = (k: string, v: unknown) => { filters.push([k, v]); return q; };
    q.order = () => q;
    q.limit = () => q;
    q.maybeSingle = async () => {
      seen.push({ table, filters: filters.map(([k, v]) => `${k}=${String(v)}`) });
      const rows = (tables[table] ?? []).filter(row => filters.every(([k, v]) => row[k] === v));
      return { data: rows[0] ?? null, error: null };
    };
    return q;
  } } as unknown as ProductionDb;
  return { db, seen };
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://proj.supabase.co");
});

describe("profile author resolution", () => {
  const a = { id: "p-a", company_id: "company-a", name: "Alex", tagline: "Founder", is_primary: true, profile_picture_url: PHOTO("company-a") };
  const b = { id: "p-b", company_id: "company-b", name: "Bea", tagline: "CEO", is_primary: true, profile_picture_url: PHOTO("company-b") };

  it("uses the piece's spokesperson, then the primary, then the company record", async () => {
    const second = { ...a, id: "p-a2", name: "Second", is_primary: false };
    const f = fake({ content_pieces: [{ id: "piece", company_id: "company-a", spokesperson_id: "p-a2" }], company_spokespersons: [a, second], companies: [] });
    expect(await resolveProfileAuthor(f.db, "company-a", "piece")).toMatchObject({ spokespersonId: "p-a2", name: "Second", tagline: "Founder" });
    expect(await resolveProfileAuthor(f.db, "company-a")).toMatchObject({ spokespersonId: "p-a", name: "Alex" });
    const company = fake({ companies: [{ id: "company-a", profile_picture_url: PHOTO("company-a"), spokesperson_name: "Alex" }] });
    expect(await resolveProfileAuthor(company.db, "company-a")).toEqual({ spokespersonId: null, name: "Alex", tagline: null, photoUrl: PHOTO("company-a") });
  });

  it("keeps every query inside the company: another tenant's person is never read", async () => {
    const f = fake({ content_pieces: [{ id: "piece", company_id: "company-a", spokesperson_id: "p-b" }], company_spokespersons: [b], companies: [] });
    await expect(resolveProfileAuthor(f.db, "company-a", "piece")).rejects.toThrow("not found for this company");
    const noPrimary = fake({ company_spokespersons: [b], companies: [{ id: "company-a", profile_picture_url: null, spokesperson_name: null }] });
    await expect(requireProfileAuthor(noPrimary.db, "company-a")).rejects.toThrow(NO_NAME_MESSAGE);
    for (const query of [...f.seen, ...noPrimary.seen]) {
      expect(query.filters.some(filter => filter === "company_id=company-a" || filter === "id=company-a"), JSON.stringify(query)).toBe(true);
    }
  });

  it("ignores a piece that belongs to another company", async () => {
    const f = fake({ content_pieces: [{ id: "piece", company_id: "company-b", spokesperson_id: "p-b" }], company_spokespersons: [a, b], companies: [] });
    expect(await resolveProfileAuthor(f.db, "company-a", "piece")).toMatchObject({ spokespersonId: "p-a" });
  });

  it("refuses a photo outside our storage", async () => {
    for (const url of ["https://media.licdn.com/dms/image/expiring.jpg", "http://proj.supabase.co/storage/v1/object/public/x.png", null]) {
      const f = fake({ company_spokespersons: [{ ...a, profile_picture_url: url }], companies: [] });
      await expect(requireProfileAuthor(f.db, "company-a")).rejects.toThrow(NO_PHOTO_MESSAGE);
    }
  });
});

describe("profile photo download", () => {
  it("never fetches a URL outside our storage", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("no"));
    for (const url of ["http://169.254.169.254/", "https://evil.example/a.png", "file:///etc/passwd", "https://proj.supabase.co/auth/v1/user"]) {
      await expect(loadProfilePhoto(url)).rejects.toThrow(NO_PHOTO_MESSAGE);
    }
    expect(fetch).not.toHaveBeenCalled();
  });

  it("returns a 240 pixel square data URI, cropped to cover", async () => {
    const png = await sharp({ create: { width: 800, height: 300, channels: 3, background: "#445566" } }).png().toBuffer();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(new Uint8Array(png), { headers: { "content-type": "image/png" } }));
    const uri = await loadProfilePhoto(PHOTO("company-a"));
    expect(uri.startsWith("data:image/png;base64,")).toBe(true);
    expect(await sharp(Buffer.from(uri.split(",")[1], "base64")).metadata()).toMatchObject({ width: 240, height: 240 });
  });

  it("rejects a non-image response and an unreadable image", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response("<html>", { headers: { "content-type": "text/html" } }));
    await expect(loadProfilePhoto(PHOTO("company-a"))).rejects.toThrow("could not be read");
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response("not an image", { headers: { "content-type": "image/png" } }));
    await expect(loadProfilePhoto(PHOTO("company-a"))).rejects.toThrow("not a usable image");
  });
});
