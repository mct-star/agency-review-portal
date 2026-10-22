import { describe, expect, it } from "vitest";
import { normalisePostcode, validateSettings } from "./settings";

describe("validateSettings", () => {
  it("accepts a sensible hospitality setup", () => {
    const r = validateSettings({
      post_pack: "hospitality",
      social_networks: ["facebook", "instagram", "facebook"],
      hospitality_settings: { venue_notes: " A lakeside restaurant. ", standing_hashtags: ["South Cerney", "#lakeside!"], allow_emoji: false },
    });
    expect(r).toEqual({
      ok: true,
      patch: {
        post_pack: "hospitality",
        social_networks: ["facebook", "instagram"],
        hospitality_settings: { venue_notes: "A lakeside restaurant.", standing_hashtags: ["#SouthCerney", "#lakeside"], allow_emoji: false },
      },
    });
  });

  it("refuses an unknown pack or network", () => {
    expect(validateSettings({ post_pack: "retail" }).ok).toBe(false);
    expect(validateSettings({ social_networks: ["myspace"] }).ok).toBe(false);
  });

  it("never lets a request reach the plan, the trial or any other column", () => {
    const r = validateSettings({ post_pack: "hospitality", plan: "agency", trial_plan: "agency", id: "x" });
    expect(r).toEqual({ ok: true, patch: { post_pack: "hospitality" } });
    expect(validateSettings({ plan: "agency" }).ok).toBe(false);
  });

  it("checks the weather settings", () => {
    expect(validateSettings({ weather_post_time: "07:00", weather_post_for: "tomorrow", timezone: "Europe/London", weather_post_enabled: true })).toMatchObject({ ok: true });
    expect(validateSettings({ weather_post_time: "7am" }).ok).toBe(false);
    expect(validateSettings({ weather_post_time: "25:00" }).ok).toBe(false);
    expect(validateSettings({ timezone: "Mars/Olympus" }).ok).toBe(false);
    expect(validateSettings({ weather_post_for: "yesterday" }).ok).toBe(false);
  });

  it("checks position values", () => {
    expect(validateSettings({ latitude: 51.668, longitude: -1.911 })).toMatchObject({ ok: true });
    expect(validateSettings({ latitude: 95 }).ok).toBe(false);
    expect(validateSettings({ longitude: "abc" }).ok).toBe(false);
    expect(validateSettings({ latitude: null, longitude: null })).toMatchObject({ ok: true, patch: { latitude: null, longitude: null } });
  });
});

describe("normalisePostcode", () => {
  it("tidies a UK postcode", () => {
    expect(normalisePostcode("gl75th")).toBe("GL7 5TH");
    expect(normalisePostcode(" gl7  5th ")).toBe("GL7 5TH");
    expect(normalisePostcode("SW1A 1AA")).toBe("SW1A 1AA");
  });
  it("refuses anything else", () => {
    expect(normalisePostcode("12345")).toBeNull();
    expect(normalisePostcode("hello")).toBeNull();
  });
});
