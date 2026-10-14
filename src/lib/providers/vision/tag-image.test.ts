import { describe, expect, it, vi } from "vitest";
import { tagImages } from "./tag-image";

const IMG = [{ mimeType: "image/jpeg" as const, base64: "AAAA" }];
const reply = {
  weather: ["bright"], place: ["lake"], subject: ["empty_scene"], time_of_day: ["morning"],
  people_present: false, text_space: true, scene: "The lake at first light.",
};

const geminiOk = () =>
  new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(reply) }] } }] }), { status: 200 });
const claudeOk = () =>
  new Response(JSON.stringify({ content: [{ type: "text", text: JSON.stringify(reply) }] }), { status: 200 });

describe("tagImages", () => {
  it("uses Gemini first and sends a strict schema", async () => {
    const fetcher = vi.fn(async () => geminiOk());
    const r = await tagImages(IMG, { fetcher, env: { GOOGLE_GEMINI_API_KEY: "g", ANTHROPIC_API_KEY: "c" } as never });
    expect(r.provider).toBe("gemini");
    expect(r.tags).toEqual(["weather:bright", "place:lake", "subject:empty_scene", "time:morning"]);
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain("gemini-2.5-flash");
    expect(JSON.parse(init.body as string).generationConfig.responseMimeType).toBe("application/json");
  });

  it("falls back to Claude when Gemini errors", async () => {
    const fetcher = vi.fn(async (url: unknown) =>
      String(url).includes("googleapis") ? new Response("overloaded", { status: 503 }) : claudeOk()
    );
    const r = await tagImages(IMG, { fetcher, env: { GOOGLE_GEMINI_API_KEY: "g", ANTHROPIC_API_KEY: "c" } as never });
    expect(r.provider).toBe("claude");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("falls back when Gemini replies with something that is not the agreed JSON", async () => {
    const bad = new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "a lovely lake" }] } }] }), { status: 200 });
    const fetcher = vi.fn(async (url: unknown) => (String(url).includes("googleapis") ? bad : claudeOk()));
    const r = await tagImages(IMG, { fetcher, env: { GOOGLE_GEMINI_API_KEY: "g", ANTHROPIC_API_KEY: "c" } as never });
    expect(r.provider).toBe("claude");
  });

  it("throws, saving nothing, when every provider fails", async () => {
    const fetcher = vi.fn(async () => new Response("no", { status: 500 }));
    await expect(
      tagImages(IMG, { fetcher, env: { GOOGLE_GEMINI_API_KEY: "g", ANTHROPIC_API_KEY: "c" } as never })
    ).rejects.toThrow(/Tagging failed/);
  });

  it("says so plainly when no key is configured", async () => {
    await expect(tagImages(IMG, { fetcher: vi.fn(), env: {} as never })).rejects.toThrow(/No vision provider/);
  });

  it("writes the raw reply to the diagnostic file only when asked, before validating it", async () => {
    const { mkdtempSync, readFileSync, existsSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const file = join(mkdtempSync(join(tmpdir(), "rawlog-")), "raw.jsonl");
    const fetcher = vi.fn(async () => geminiOk());
    await tagImages(IMG, { fetcher, env: { GOOGLE_GEMINI_API_KEY: "g", TAG_RAW_LOG_FILE: file } as never });
    const line = JSON.parse(readFileSync(file, "utf8").trim());
    expect(line).toMatchObject({ provider: "gemini", images: 1 });
    expect(JSON.parse(line.text).weather).toEqual(["bright"]);
    expect(JSON.stringify(line)).not.toMatch(/AAAA/);
    // Off by default.
    const other = join(mkdtempSync(join(tmpdir(), "rawlog-")), "none.jsonl");
    await tagImages(IMG, { fetcher, env: { GOOGLE_GEMINI_API_KEY: "g" } as never });
    expect(existsSync(other)).toBe(false);
  });

  it("sends every frame of a video in one call", async () => {
    const fetcher = vi.fn(async () => geminiOk());
    await tagImages([...IMG, ...IMG, ...IMG], { fetcher, env: { GOOGLE_GEMINI_API_KEY: "g" } as never });
    const body = JSON.parse((fetcher.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(body.contents[0].parts.filter((p: { inline_data?: unknown }) => p.inline_data)).toHaveLength(3);
  });
});
