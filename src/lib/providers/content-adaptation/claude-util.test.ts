import { afterEach, describe, expect, it, vi } from "vitest";
import { CLAUDE_HAIKU, CLAUDE_SONNET, callText, currentClaudeModel, resolveClaudeConfig } from "./claude-util";
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
describe("compatibility model resolution", () => {
  it("maps retired ids to supported families", () => {
    expect(currentClaudeModel("claude-sonnet-4-20250514")).toBe(CLAUDE_SONNET);
    expect(currentClaudeModel("claude-opus-4-20250514")).toBe(CLAUDE_SONNET);
    expect(currentClaudeModel("claude-3-5-haiku-20241022")).toBe(CLAUDE_HAIKU);
    expect(currentClaudeModel("claude-haiku-4-20250514")).toBe(CLAUDE_HAIKU);
  });
  it("resolves an OpenAI configuration without passing its key to Claude", async () => {
    const { apiKey, model } = resolveClaudeConfig({ api_key: "company-key" }, { provider: "openai_gpt4" });
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ model: "gpt-6.1-sol", status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: "ok" }] }] })));
    vi.stubGlobal("fetch", fetcher);
    expect(await callText(apiKey, model, "system", "user")).toMatchObject({ provider: "openai", text: "ok" });
    expect(String(fetcher.mock.calls[0][0])).toContain("openai.com");
  });
  it("never substitutes a shared key for missing supplied company credentials", () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "shared");
    expect(() => resolveClaudeConfig({}, { provider: "anthropic_claude" })).toThrow(/No AI provider/);
  });
});
