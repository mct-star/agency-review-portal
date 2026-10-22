import { describe, expect, it, vi } from "vitest";
import { tagImages } from "./tag-image";
const images = [{ mimeType: "image/jpeg" as const, base64: "AAAA" }];
const reply = { weather: ["bright"], place: ["lake"], subject: ["empty_scene"], time_of_day: ["morning"], people_present: false, text_space: true, scene: "The lake at first light." };
describe("dual provider vision tagging", () => {
  it.each(["claude", "openai"] as const)("uses %s structured small-model classification for all frames", async provider => {
    const response = provider === "claude" ? { model: "claude-haiku-5-5", content: [{ type: "text", text: JSON.stringify(reply) }] } : { model: "gpt-6-luna", status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(reply) }] }] };
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify(response)));
    const result = await tagImages([...images, ...images], { fetcher, env: { AI_TEXT_PROVIDER: provider, ANTHROPIC_API_KEY: "c", OPENAI_API_KEY: "o" } });
    expect(result).toMatchObject({ provider, tags: ["weather:bright", "place:lake", "subject:empty_scene", "time:morning"] });
    const body = JSON.parse(fetcher.mock.calls[0][1].body);
    expect(body.model).toBe(provider === "claude" ? "claude-haiku-5-5" : "gpt-6-luna");
    const content = provider === "claude" ? body.messages[0].content : body.input[0].content;
    expect(content).toHaveLength(3);
  });
  it("rejects invalid shape without sending it to another funded provider", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ content: [{ type: "text", text: "{}" }] })));
    await expect(tagImages(images, { fetcher, env: { ANTHROPIC_API_KEY: "c", OPENAI_API_KEY: "o" } })).rejects.toThrow(/could not complete/);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
