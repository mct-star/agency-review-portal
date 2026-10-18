import { afterEach, describe, expect, it, vi } from "vitest";
import { callClaude } from "./content-adaptation/claude-util";
import { modelFor, requestText, resolveTextConfig, sharedTextConfig, TEXT_MODELS, type TextConfig } from "./text-runtime";
const { resolveProvider } = vi.hoisted(() => ({ resolveProvider: vi.fn() }));
vi.mock("./index", () => ({ resolveProvider }));
const schema = { type: "object", properties: { ok: { type: "boolean" } }, required: ["ok"], additionalProperties: false };
const options = { systemPrompt: "Voice and format rules", userPrompt: "Write", maxTokens: 1000 };
const config: TextConfig = { provider: "claude", apiKey: "company-a" };
const claude = (text = "hello", model: string = TEXT_MODELS.claude.writing) => new Response(JSON.stringify({ model, content: [{ type: "thinking" }, { type: "text", text }], stop_reason: "end_turn" }));
const openai = (text = "hello", model: string = TEXT_MODELS.openai.writing) => new Response(JSON.stringify({ model, status: "completed", output: [{ type: "reasoning" }, { type: "message", content: [{ type: "output_text", text }] }] }));
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.useRealTimers(); resolveProvider.mockReset(); });
describe("native dual text transport", () => {
  it.each(["claude", "openai"] as const)("preserves a dated %s snapshot for the selected alias", async provider => {
    const model = TEXT_MODELS[provider].writing + (provider === "claude" ? "-20261018" : "-2026-10-18");
    const fetcher = vi.fn().mockResolvedValue(provider === "claude" ? claude("hello", model) : openai("hello", model));
    expect(await requestText({ ...config, provider }, options, fetcher)).toMatchObject({ provider, model });
  });
  it("keeps Claude writing rules, disables thinking and excludes temperature", async () => {
    const fetcher = vi.fn().mockResolvedValue(claude());
    expect(await requestText(config, options, fetcher)).toEqual({ text: "hello", provider: "claude", model: TEXT_MODELS.claude.writing });
    const body = JSON.parse(fetcher.mock.calls[0][1].body);
    expect(body).toMatchObject({ system: options.systemPrompt, thinking: { type: "between_tools" }, output_config: { effort: "low" } });
    expect(body).not.toHaveProperty("temperature");
  });
  it("uses native Responses with shared prompts and strict structured output", async () => {
    const fetcher = vi.fn().mockResolvedValue(openai('{"ok":true}'));
    const out = await requestText({ ...config, provider: "openai" }, { ...options, jsonSchema: schema }, fetcher);
    expect(out.provider).toBe("openai");
    expect(String(fetcher.mock.calls[0][0])).toMatch(/\/v1\/responses$/);
    const init = fetcher.mock.calls[0][1];
    expect(init.headers.Authorization).toBe("Bearer company-a");
    expect(JSON.parse(init.body)).toMatchObject({ store: false, instructions: options.systemPrompt, input: [{ role: "user", content: "Write" }], text: { format: { type: "json_schema", strict: true, schema } } });
  });
  it.each(["claude", "openai"] as const)("rejects malformed and schema-invalid %s output without leaking provider payloads", async provider => {
    for (const text of ["not json", '{"ok":"secret-company-key"}', '{"ok":true,"extra":1}']) {
      const fetcher = vi.fn().mockResolvedValue(provider === "claude" ? claude(text) : openai(text));
      await expect(requestText({ ...config, provider }, { ...options, jsonSchema: schema }, fetcher)).rejects.toThrow(/could not complete/);
      expect(fetcher).toHaveBeenCalledTimes(1);
    }
  });
  it("rejects truncation, refusal, and unexpected model identity", async () => {
    for (const response of [openai("", TEXT_MODELS.openai.writing), openai("hello", "unexpected-model"), new Response(JSON.stringify({ status: "incomplete", output: [] }))]) {
      await expect(requestText({ ...config, provider: "openai" }, options, vi.fn().mockResolvedValue(response))).rejects.toThrow(/could not complete/);
    }
  });
  it("retries transient failures once and does not silently charge a shared key", async () => {
    vi.stubEnv("OPENAI_API_KEY", "shared-other-key");
    const fetcher = vi.fn().mockImplementation(async () => new Response("secret-company-key", { status: 503 }));
    await expect(requestText(config, options, fetcher)).rejects.toThrow(/could not complete/);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls.every(call => call[1].headers["x-api-key"] === "company-a")).toBe(true);
  });
  it("only crosses providers when the shared fallback is explicitly approved", async () => {
    const env = { ANTHROPIC_API_KEY: "a", OPENAI_API_KEY: "b" };
    expect(sharedTextConfig(env).fallback).toBeUndefined();
    const approved = sharedTextConfig({ ...env, AI_TEXT_FALLBACK_APPROVED: "true" });
    const fetcher = vi.fn().mockResolvedValueOnce(new Response("down", { status: 503 })).mockResolvedValueOnce(new Response("down", { status: 503 })).mockResolvedValueOnce(openai("fallback"));
    expect(await requestText(approved, options, fetcher)).toMatchObject({ provider: "openai", text: "fallback" });
    expect(fetcher).toHaveBeenCalledTimes(3);
    const unauthorised = vi.fn().mockResolvedValue(new Response("bad key", { status: 401 }));
    await expect(requestText(approved, options, unauthorised)).rejects.toThrow();
    expect(unauthorised).toHaveBeenCalledTimes(1);
  });
  it("aborts a hung request within one total deadline", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn().mockImplementation(() => new Promise(() => {}));
    const pending = expect(requestText(config, { ...options, timeoutMs: 10 }, fetcher)).rejects.toThrow(/could not complete/);
    await vi.advanceTimersByTimeAsync(10);
    await pending;
    expect(fetcher.mock.calls[0][1].signal.aborted).toBe(true);
  });
  it.each(["claude", "openai"] as const)("limits cheap %s routing to bounded structured utility tasks", provider => {
    const c = { ...config, provider };
    expect(modelFor(c, { ...options, task: "classification", jsonSchema: schema })).toBe(TEXT_MODELS[provider].utility);
    expect(modelFor(c, { ...options, task: "writing", jsonSchema: schema })).toBe(TEXT_MODELS[provider].writing);
    expect(modelFor(c, { ...options, task: "routing" })).toBe(TEXT_MODELS[provider].writing);
    expect(modelFor(c, { ...options, task: "routing", jsonSchema: schema, userPrompt: "x".repeat(24001) })).toBe(TEXT_MODELS[provider].writing);
    expect(modelFor(c, { ...options, task: "routing", jsonSchema: schema, maxTokens: 4096 })).toBe(TEXT_MODELS[provider].writing);
    expect(modelFor({ ...c, settings: { utility_tier: "quality" } }, { ...options, task: "routing", jsonSchema: schema })).toBe(TEXT_MODELS[provider].writing);
  });
  it("resolves the requested company only and never fills a broken company config with shared credentials", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "shared-key");
    resolveProvider.mockResolvedValueOnce({ provider: "openai_gpt4", credentials: { api_key: "company-b" }, settings: {} });
    expect(await resolveTextConfig("b")).toMatchObject({ provider: "openai", apiKey: "company-b" });
    expect(resolveProvider).toHaveBeenCalledWith("b", "content_generation");
    resolveProvider.mockResolvedValueOnce({ provider: "anthropic_claude", credentials: {}, settings: {} });
    await expect(resolveTextConfig("a")).rejects.toThrow(/No AI provider/);
    resolveProvider.mockRejectedValueOnce(new Error("lookup failed"));
    await expect(resolveTextConfig("a")).rejects.toThrow("lookup failed");
  });
  it.each(["claude", "openai"] as const)("company selection overrides an obsolete raw callClaude key and model for %s", async provider => {
    resolveProvider.mockResolvedValue({ provider: provider === "claude" ? "anthropic_claude" : "openai_gpt4", credentials: { api_key: "selected-company-key" }, settings: {} });
    const fetcher = vi.fn().mockResolvedValue(provider === "claude" ? claude("selected") : openai("selected"));
    vi.stubGlobal("fetch", fetcher);
    expect(await callClaude("obsolete-caller-key", provider === "claude" ? "gpt-6.1-sol" : TEXT_MODELS.claude.writing, "voice", "topic", 1000, { companyId: "selected-company" })).toBe("selected");
    expect(resolveProvider).toHaveBeenCalledWith("selected-company", "content_generation");
    const [url, init] = fetcher.mock.calls[0];
    expect(String(url)).toContain(provider === "claude" ? "anthropic.com" : "openai.com");
    expect(init.headers[provider === "claude" ? "x-api-key" : "Authorization"]).toBe(provider === "claude" ? "selected-company-key" : "Bearer selected-company-key");
    expect(JSON.stringify(init)).not.toContain("obsolete-caller-key");
  });
  it("company selection reports request-local identity concurrently", async () => {
    resolveProvider.mockImplementation(async (id: string) => ({ provider: id === "a" ? "anthropic_claude" : "openai_gpt4", credentials: { api_key: id }, settings: {} }));
    vi.stubGlobal("fetch", vi.fn(async (url: string) => url.includes("anthropic") ? claude("A") : openai("B")));
    const [a, b] = await Promise.all([
      resolveTextConfig("a").then(c => requestText(c, options)),
      resolveTextConfig("b").then(c => requestText(c, options)),
    ]);
    expect(a).toMatchObject({ text: "A", provider: "claude" });
    expect(b).toMatchObject({ text: "B", provider: "openai" });
  });
});
