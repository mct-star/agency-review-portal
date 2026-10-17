import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generateText } from "./generate-text";

/**
 * Hosted writing must authenticate with API keys and survive a provider's
 * quota failure without consulting a local Claude Code subscription.
 */
describe("hosted writing API independence", () => {
  const fetchMock = vi.fn();
  const options = { systemPrompt: "Write for the venue.", userPrompt: "A sourced brief." };

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("ANTHROPIC_API_KEY", "platform-api-key");
    vi.stubEnv("GOOGLE_GEMINI_API_KEY", "platform-fallback-key");
    vi.stubEnv("CLAUDE_CODE_OAUTH_TOKEN", "unrelated-subscription-token");
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("uses the platform API key rather than subscription authentication", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ content: [{ type: "text", text: "A welcoming caption." }] }));

    const result = await generateText(options);

    expect(result).toMatchObject({ text: "A welcoming caption.", provider: "claude" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.anthropic.com/v1/messages");
    expect(new Headers(request.headers).get("x-api-key")).toBe("platform-api-key");
    expect(new Headers(request.headers).has("authorization")).toBe(false);
    expect(JSON.stringify(request)).not.toContain("unrelated-subscription-token");
  });

  it("uses the independent fallback when the primary API exhausts its quota", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response("API quota exhausted", { status: 429 }))
      .mockResolvedValueOnce(Response.json({ candidates: [{ content: { parts: [{ text: "The fallback caption." }] } }] }));

    const result = await generateText(options);

    expect(result).toEqual({ text: "The fallback caption.", provider: "gemini", model: "gemini-2.5-flash" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[1][0])).toContain("generativelanguage.googleapis.com");
  });

  it("works with the fallback API even when no primary API key is configured", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    fetchMock.mockResolvedValueOnce(Response.json({ candidates: [{ content: { parts: [{ text: "API-only caption." }] } }] }));

    expect(await generateText(options)).toMatchObject({ text: "API-only caption.", provider: "gemini" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain("generativelanguage.googleapis.com");
  });

  it("reports unavailable writing without exposing raw provider failures", async () => {
    fetchMock.mockImplementation(async () => new Response("private provider account detail", { status: 429 }));

    await expect(generateText(options)).rejects.toThrow(
      "The writing assistant could not complete this request. Please try again, or ask AGENCY to check it."
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
