import { describe, expect, it, vi } from "vitest";
const { resolveTextConfig, requestText } = vi.hoisted(() => ({ resolveTextConfig: vi.fn(), requestText: vi.fn() }));
vi.mock("../text-runtime", () => ({ resolveTextConfig, requestText }));
import { generateText } from "./generate-text";
describe("generateText company policy", () => {
  it("passes companyId to credential lookup and keeps prompt, schema, and identity intact", async () => {
    const config = { provider: "openai", apiKey: "company-b" };
    const identity = { provider: "openai", model: "gpt-6.1-sol", text: "result" };
    resolveTextConfig.mockResolvedValue(config);
    requestText.mockResolvedValue(identity);
    const options = { companyId: "b", systemPrompt: "voice", userPrompt: "topic", jsonSchema: { type: "object" } };
    expect(await generateText(options)).toEqual(identity);
    expect(resolveTextConfig).toHaveBeenCalledWith("b");
    expect(requestText).toHaveBeenCalledWith(config, options);
  });
});
