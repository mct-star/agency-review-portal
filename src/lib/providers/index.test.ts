import { afterEach, describe, expect, it, vi } from "vitest";
const { database, lookups } = vi.hoisted(() => ({ database: new Map<string, unknown>(), lookups: [] as Record<string, unknown>[] }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminSupabaseClient: async () => ({ from: () => {
  const filters: Record<string, unknown> = {};
  const query = { select: () => query, eq: (key: string, value: unknown) => { filters[key] = value; return query; }, maybeSingle: async () => { lookups.push(filters); return { data: database.get(String(filters.company_id)) ?? null, error: null }; } };
  return query;
} }) }));
vi.mock("@/lib/crypto", () => ({ decryptJson: JSON.parse }));
import { getContentProvider, getPlatformAdaptationProvider } from "./index";
const output = { title: "Title", markdownBody: "Voice matched body", firstComment: null, wordCount: 3, postType: "insight", imagePrompt: null, assets: [] };
const base = { blueprintContent: "Use measured British English", topicTitle: "Topic", topicDescription: null, pillar: null, audienceTheme: null, contentType: "social_post" as const, weekNumber: 1, spokespersonName: null };
afterEach(() => { database.clear(); lookups.length = 0; vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
describe("company content provider registry", () => {
  it("uses each company's own native endpoint and carries writer identity with the result", async () => {
    database.set("a", { provider: "anthropic_claude", credentials_encrypted: JSON.stringify({ api_key: "a-key" }), provider_settings: {} });
    database.set("b", { provider: "openai_gpt4", credentials_encrypted: JSON.stringify({ api_key: "b-key" }), provider_settings: {} });
    const fetcher = vi.fn(async (url: string, init: RequestInit) => {
      const headers = init.headers as Record<string, string>;
      const text = JSON.stringify(output);
      if (url.includes("anthropic")) { expect(headers["x-api-key"]).toBe("a-key"); return new Response(JSON.stringify({ model: "claude-sonnet-5-5", content: [{ type: "text", text }] })); }
      expect(headers.Authorization).toBe("Bearer b-key");
      return new Response(JSON.stringify({ model: "gpt-6.1-sol", status: "completed", output: [{ type: "message", content: [{ type: "output_text", text }] }] }));
    });
    vi.stubGlobal("fetch", fetcher);
    const [a, b] = await Promise.all([getContentProvider("a"), getContentProvider("b")]);
    const [ar, br] = await Promise.all([a.provider.generate(base), b.provider.generate(base)]);
    expect(ar.writer).toEqual({ provider: "claude", model: "claude-sonnet-5-5" });
    expect(br.writer).toEqual({ provider: "openai", model: "gpt-6.1-sol" });
    expect(lookups).toEqual(expect.arrayContaining([expect.objectContaining({ company_id: "a", service_category: "content_generation", is_active: true }), expect.objectContaining({ company_id: "b" })]));
    expect(JSON.stringify(fetcher.mock.calls)).toContain("Use measured British English");
  });
  it("routes adaptation through the selected provider with the original voice prompt", async () => {
    database.set("b", { provider: "openai_gpt4", credentials_encrypted: JSON.stringify({ api_key: "b-key" }), provider_settings: {} });
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ model: "gpt-6.1-sol", status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify({ adaptedCopy: "copy", adaptedFirstComment: null, hashtags: [], mentions: [], characterCount: 4 }) }] }] })));
    vi.stubGlobal("fetch", fetcher);
    const { provider } = await getPlatformAdaptationProvider("b");
    expect((await provider.adapt({ originalCopy: "copy", originalFirstComment: null, platform: "facebook", maxChars: 500, spokespersonName: null })).adaptedCopy).toBe("copy");
    expect(fetcher.mock.calls[0][0]).toContain("openai.com");
    expect(JSON.parse(fetcher.mock.calls[0][1].body).instructions).toContain("Preserve the author's voice exactly");
  });
});
