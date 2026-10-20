import { describe, expect, it } from "vitest";
import { fakeSupabase } from "@/test/fake-supabase";
import { loadGenerationVoiceProfile } from "./voice-profile";
import { buildVoicePrompt } from "@/lib/voice-to-prompt";

type Client = Parameters<typeof loadGenerationVoiceProfile>[0];

describe("the first post's inherited company voice", () => {
  it("feeds the onboarding voice into generation even when the new primary spokesperson has no override", async () => {
    const fake = fakeSupabase({ company_voice_profiles: (calls) => ({
      data: calls.some((call) => call.method === "is") ? { voice_description: "Plain, direct, helpful", writing_samples: "Our company writing sample" } : null,
    }) });
    const voice = await loadGenerationVoiceProfile(fake.client as unknown as Client, "company-a", "primary-person");
    expect(buildVoicePrompt(voice)).toContain("Plain, direct, helpful");
    expect(fake.calls.filter((call) => call.method === "eq" && call.args[0] === "company_id")).toEqual([
      { table: "company_voice_profiles", method: "eq", args: ["company_id", "company-a"] },
      { table: "company_voice_profiles", method: "eq", args: ["company_id", "company-a"] },
    ]);
  });

  it("preserves a person's own voice ahead of the shared company voice", async () => {
    const fake = fakeSupabase({ company_voice_profiles: { data: { voice_description: "Person's own voice" } } });
    expect((await loadGenerationVoiceProfile(fake.client as unknown as Client, "company-a", "person"))?.voice_description).toBe("Person's own voice");
    expect(fake.calls.some((call) => call.method === "is")).toBe(false);
  });

  it("does not silently switch voices after a lookup failure", async () => {
    const fake = fakeSupabase({ company_voice_profiles: { error: { message: "Unavailable" } } });
    await expect(loadGenerationVoiceProfile(fake.client as unknown as Client, "company-a", "person")).rejects.toThrow("could not be loaded");
    expect(fake.calls.some((call) => call.method === "is")).toBe(false);
  });
});
