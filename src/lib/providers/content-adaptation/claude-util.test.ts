import { afterEach, describe, expect, it, vi } from "vitest";
import { CLAUDE_HAIKU, CLAUDE_SONNET, GEMINI_FLASH, callText, currentClaudeModel, resolveClaudeConfig } from "./claude-util";

describe("currentClaudeModel", () => {
  it("maps every retired id to a current one", () => {
    expect(currentClaudeModel("claude-sonnet-4-20250514")).toBe(CLAUDE_SONNET);
    expect(currentClaudeModel("claude-opus-4-20250514")).toBe(CLAUDE_SONNET);
    expect(currentClaudeModel("claude-3-5-haiku-20241022")).toBe(CLAUDE_HAIKU);
    expect(currentClaudeModel("claude-haiku-4-20250514")).toBe(CLAUDE_HAIKU);
  });
  it("keeps a current id and defaults to Sonnet", () => {
    expect(currentClaudeModel(CLAUDE_HAIKU)).toBe(CLAUDE_HAIKU);
    expect(currentClaudeModel(undefined)).toBe(CLAUDE_SONNET);
    expect(currentClaudeModel("something-haiku-new")).toBe(CLAUDE_HAIKU);
  });
  it("resolveClaudeConfig never returns a retired id from stored settings", () => {
    const { model } = resolveClaudeConfig({ api_key: "k" }, { model: "claude-sonnet-4-20250514" });
    expect(model).toBe(CLAUDE_SONNET);
  });
});

describe("callText", () => {
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  afterEach(() => {
    fetchMock.mockReset();
    delete process.env.GOOGLE_GEMINI_API_KEY;
  });

  it("sends no temperature, switches thinking off and reads the first text block", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ content: [{ type: "thinking", thinking: "..." }, { type: "text", text: "hello" }] }), { status: 200 })
    );
    const out = await callText("key", "claude-sonnet-4-20250514", "sys", "user", 100);
    expect(out).toEqual({ text: "hello", provider: "claude", model: CLAUDE_SONNET });
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.model).toBe(CLAUDE_SONNET);
    expect(body.temperature).toBeUndefined();
    expect(body.thinking).toEqual({ type: "between_tools" });
  });

  it("falls back to Gemini Flash and says so", async () => {
    process.env.GOOGLE_GEMINI_API_KEY = "g";
    fetchMock
      .mockResolvedValueOnce(new Response("overloaded", { status: 529 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "from flash" }] } }] }), { status: 200 }));
    const out = await callText("key", CLAUDE_SONNET, "sys", "user", 100);
    expect(out).toEqual({ text: "from flash", provider: "gemini", model: GEMINI_FLASH });
    expect(String(fetchMock.mock.calls[1][0])).toContain(GEMINI_FLASH);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("never calls OpenAI or Gemini Pro", async () => {
    process.env.GOOGLE_GEMINI_API_KEY = "g";
    process.env.OPENAI_API_KEY = "o";
    fetchMock.mockResolvedValue(new Response("down", { status: 500 }));
    await expect(callText("key", CLAUDE_SONNET, "sys", "user", 100)).rejects.toThrow(/could not complete this request/);
    const urls = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(urls.some((u) => u.includes("openai"))).toBe(false);
    expect(urls.some((u) => u.includes("gemini-2.5-pro"))).toBe(false);
    delete process.env.OPENAI_API_KEY;
  });
});
