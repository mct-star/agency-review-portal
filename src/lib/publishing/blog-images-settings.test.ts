import { describe, expect, it } from "vitest";
import { fakeSupabase } from "@/test/fake-supabase";
import { DEFAULT_BLOG_GATE_SETTINGS } from "./blog-gate";
import { loadBlogImagesPayload } from "./blog-images";

/**
 * The image panel only shows the checks: when the company's settings cannot
 * be read it shows the defaults, not enforced, as before (15 Nov 2026). The
 * publish route refuses instead.
 */
const piece = { id: "piece-1", company_id: "11111111-1111-4111-8111-111111111111", title: "Example blog", markdown_body: "Words." };

describe("loadBlogImagesPayload settings", () => {
  it("shows the defaults, not enforced, when the settings read fails", async () => {
    const { client } = fakeSupabase({
      content_images: { data: [] },
      company_api_configs: { data: null, error: { message: "read failed" } },
    });
    const out = await loadBlogImagesPayload(client, piece);
    if (!("settings" in out)) throw new Error("expected a payload");
    expect(out.settings).toEqual({ ...DEFAULT_BLOG_GATE_SETTINGS, enforceImageChecks: false });
  });

  it("shows the defaults, not enforced, when enforceImageChecks is set up wrongly", async () => {
    const { client } = fakeSupabase({
      content_images: { data: [] },
      company_api_configs: { data: { provider_settings: { enforceImageChecks: "true" } } },
    });
    const out = await loadBlogImagesPayload(client, piece);
    if (!("settings" in out)) throw new Error("expected a payload");
    expect(out.settings).toEqual({ ...DEFAULT_BLOG_GATE_SETTINGS, enforceImageChecks: false });
  });

  it("uses the company's own settings when they read", async () => {
    const { client } = fakeSupabase({
      content_images: { data: [] },
      company_api_configs: { data: { provider_settings: { enforceImageChecks: true, requireShareCard: false } } },
    });
    const out = await loadBlogImagesPayload(client, piece);
    if (!("settings" in out)) throw new Error("expected a payload");
    expect(out.settings).toMatchObject({ enforceImageChecks: true, requireShareCard: false });
  });
});

describe("mergeImageRecord caption (19 Nov 2026)", () => {
  it("keeps a stored caption when the request leaves it out, and clears it when sent empty", async () => {
    const { mergeImageRecord } = await import("./blog-images");
    const stored = { role: "inline", passage: "p", alt: "a", caption: "Fees begin here." };
    expect(mergeImageRecord("inline", stored, { alt: "b" })).toEqual({ record: { role: "inline", passage: "p", alt: "b", caption: "Fees begin here." } });
    expect(mergeImageRecord("inline", stored, { caption: "" })).toEqual({ record: { role: "inline", passage: "p", alt: "a" } });
    expect(mergeImageRecord("inline", stored, { caption: "New line." })).toMatchObject({ record: { caption: "New line." } });
  });

  it("refuses a caption with a long dash", async () => {
    const { mergeImageRecord } = await import("./blog-images");
    expect(mergeImageRecord("inline", null, { caption: `a ${String.fromCharCode(0x2014)} b` })).toEqual({ error: "The caption contains a long dash. Use a comma, full stop or brackets instead." });
  });
});
