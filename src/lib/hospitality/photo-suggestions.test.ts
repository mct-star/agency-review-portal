import { describe, expect, it } from "vitest";
import { getPostType } from "@/lib/constants/post-types";
import { fakeSupabase } from "@/test/fake-supabase";
import { suggestPhotos, wantFor } from "./photo-suggestions";
import { buildHospitalityPrompt } from "./prompts";

const row = (id: string, tags: string[], people: boolean | null = false) => ({
  id, kind: "photo", tags, people_present: people, last_used_at: null, used_in_weeks: [], status: "approved", thumb_path: `${id}.jpg`, scene_label: id,
});

describe("photo suggestions", () => {
  it("the weather post asks for the day's weather, the special asks for food", () => {
    expect(wantFor(getPostType("weather_of_the_day"), ["rain"]).weather).toEqual(["rain"]);
    expect(wantFor(getPostType("special_of_the_day")).subject).toContain("food");
    expect(wantFor(undefined)).toEqual({ avoidPeople: true });
  });

  it("returns up to three, best match first, never a photo with people when the post avoids them", async () => {
    const { client } = fakeSupabase(
      { photo_inventory: { data: [row("rainy-deck", ["weather:rain", "place:deck", "subject:empty_scene"]), row("sunny-lake", ["weather:sunny", "place:lake"]), row("crowd", ["weather:rain", "place:bar"], true), row("bar", ["place:bar", "subject:empty_scene"])] } },
      { storage: { createSignedUrls: { data: [{ path: "rainy-deck.jpg", signedUrl: "https://signed/rainy-deck" }], error: null } } }
    );
    const out = await suggestPhotos(client as never, "c", wantFor(getPostType("weather_of_the_day"), ["rain"]), 3);
    expect(out.length).toBeLessThanOrEqual(3);
    expect(out[0].id).toBe("rainy-deck");
    expect(out.map((o) => o.id)).not.toContain("crowd");
  });

  it("an empty library gives an empty list, not an error", async () => {
    const { client } = fakeSupabase({ photo_inventory: { data: [] } });
    expect(await suggestPhotos(client as never, "c", { avoidPeople: true })).toEqual([]);
  });
});

describe("the venue's voice", () => {
  it("asks for entertaining copy and keeps the fact boundary", () => {
    const { system } = buildHospitalityPrompt({
      company: { name: "Lakeside", settings: {} },
      postType: getPostType("weather_of_the_day")!,
      brief: "",
      forecastFacts: "High 15C, 86 percent chance of rain",
    });
    expect(system).toMatch(/Entertain first/);
    expect(system).toMatch(/never from invented facts/);
    expect(system).toMatch(/SOURCE BOUNDARY/);
  });
});
