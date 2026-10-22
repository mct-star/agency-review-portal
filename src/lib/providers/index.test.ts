import { afterEach, describe, expect, it, vi } from "vitest";
const { database, lookups } = vi.hoisted(() => ({ database: new Map<string, unknown>(), lookups: [] as Record<string, unknown>[] }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminSupabaseClient: async () => ({ from: () => {
  const filters: Record<string, unknown> = {};
  const query = { select: () => query, eq: (key: string, value: unknown) => { filters[key] = value; return query; }, maybeSingle: async () => {
    lookups.push(filters);
    const stored = database.get(String(filters.company_id));
    const rows = (Array.isArray(stored) ? stored : stored ? [stored] : []) as Record<string, unknown>[];
    const data = rows.find(row => Object.entries(filters).every(([key, value]) => key === "company_id" || key === "service_category" ? row[key] === undefined || row[key] === value : (key === "is_active" ? row[key] ?? true : row[key]) === value));
    return { data: data ?? null, error: null };
  } };
  return query;
} }) }));
vi.mock("@/lib/crypto", () => ({ decryptJson: JSON.parse }));
import { getContentProvider, getPlatformAdaptationProvider } from "./index";
import { modelFor, requestText, resolveTextConfig, TEXT_MODELS } from "./text-runtime";
const output = { title: "Title", markdownBody: "Voice matched body", firstComment: null, wordCount: 3, postType: "insight", imagePrompt: null, assets: [] };
const base = { blueprintContent: "Use measured British English", topicTitle: "Topic", topicDescription: null, pillar: null, audienceTheme: null, contentType: "social_post" as const, weekNumber: 1, spokespersonName: null };
const storedWriter = (provider: string, is_active: boolean, settings = {}) => ({ provider, is_active, credentials_encrypted: JSON.stringify({ api_key: `a-${provider}` }), provider_settings: settings });
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
  it.each(["anthropic_claude", "openai_gpt4"])("fails over from %s to the same company's inactive writer with truthful provenance", async selected => {
    const alternate = selected === "anthropic_claude" ? "openai_gpt4" : "anthropic_claude";
    database.set("a", [storedWriter(selected, true, { fallback_approved: true }), storedWriter(alternate, false)]);
    const fetcher = vi.fn(async (_url: string, init: RequestInit) => {
      const headers = init.headers as Record<string, string>;
      if (headers["x-api-key"] === `a-${selected}` || headers.Authorization === `Bearer a-${selected}`) {
        return new Response(JSON.stringify({ error: selected === "anthropic_claude" ? { type: "billing_error" } : { code: "credit_balance_exhausted" } }), { status: selected === "anthropic_claude" ? 402 : 429 });
      }
      const text = JSON.stringify(output);
      if (alternate === "anthropic_claude") {
        expect(headers["x-api-key"]).toBe(`a-${alternate}`);
        return new Response(JSON.stringify({ model: "claude-sonnet-5-5", content: [{ type: "text", text }] }));
      }
      expect(headers.Authorization).toBe(`Bearer a-${alternate}`);
      return new Response(JSON.stringify({ model: "gpt-6.1-sol", status: "completed", output: [{ type: "message", content: [{ type: "output_text", text }] }] }));
    });
    vi.stubGlobal("fetch", fetcher);
    const { provider } = await getContentProvider("a");
    expect((await provider.generate(base)).writer).toEqual(alternate === "anthropic_claude" ? { provider: "claude", model: "claude-sonnet-5-5" } : { provider: "openai", model: "gpt-6.1-sol" });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(lookups[1]).toEqual({ company_id: "a", service_category: "content_generation", provider: alternate });
  });
  it.each([undefined, false, "true"])("does not load an alternate without Boolean approval (%s)", async fallback_approved => {
    database.set("a", [storedWriter("openai_gpt4", true, { fallback_approved }), storedWriter("anthropic_claude", false)]);
    expect((await resolveTextConfig("a")).fallback).toBeUndefined();
    expect(lookups).toHaveLength(1);
  });
  it("never substitutes another company's writer or shared funding when the alternate is missing", async () => {
    database.set("a", [storedWriter("openai_gpt4", true, { fallback_approved: true })]);
    database.set("b", storedWriter("anthropic_claude", false));
    vi.stubEnv("ANTHROPIC_API_KEY", "shared-key");
    vi.stubEnv("AI_TEXT_FALLBACK_APPROVED", "true");
    const config = await resolveTextConfig("a");
    expect(config.fallback).toBeUndefined();
    const fetcher = vi.fn(async (_url: Parameters<typeof fetch>[0], _init?: RequestInit) => new Response(JSON.stringify({ error: { code: "credit_balance_exhausted" } }), { status: 429 }));
    await expect(requestText(config, { systemPrompt: "", userPrompt: "Write" }, fetcher)).rejects.toThrow(/could not complete/);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][1]?.headers).toMatchObject({ Authorization: "Bearer a-openai_gpt4" });
    expect(lookups.every(lookup => lookup.company_id === "a")).toBe(true);
  });
  it.each(["invalid ciphertext", "{}", '{"api_key":""}'])("keeps a healthy primary usable with unusable alternate credentials %s", async credentials_encrypted => {
    database.set("a", [storedWriter("openai_gpt4", true, { fallback_approved: true }), { ...storedWriter("anthropic_claude", false), credentials_encrypted }]);
    expect(await resolveTextConfig("a")).toMatchObject({ provider: "openai", apiKey: "a-openai_gpt4" });
    expect((await resolveTextConfig("a")).fallback).toBeUndefined();
  });
  it("stops after both approved company providers run out of funds without a fallback cycle", async () => {
    database.set("a", [storedWriter("openai_gpt4", true, { fallback_approved: true }), storedWriter("anthropic_claude", false, { fallback_approved: true })]);
    const config = await resolveTextConfig("a");
    const fetcher = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ error: { code: "credit_balance_exhausted" } }), { status: 429 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { type: "billing_error" } }), { status: 402 }));
    await expect(requestText(config, { systemPrompt: "", userPrompt: "Write" }, fetcher)).rejects.toThrow(/could not complete/);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(config.fallback?.fallback).toBeUndefined();
  });
  it("preserves the primary quality preference when falling back to a writer without an override", async () => {
    database.set("a", [storedWriter("openai_gpt4", true, { fallback_approved: true, utility_tier: "quality" }), storedWriter("anthropic_claude", false)]);
    const config = await resolveTextConfig("a");
    expect(config.settings?.utility_tier).toBe("quality");
    expect(modelFor(config.fallback!, { systemPrompt: "", userPrompt: "Classify", task: "classification", maxTokens: 100, jsonSchema: { type: "boolean" } })).toBe(TEXT_MODELS.claude.writing);
  });
});
