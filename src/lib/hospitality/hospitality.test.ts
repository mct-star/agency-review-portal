import { describe, expect, it, vi } from "vitest";
import { getPostType } from "@/lib/constants/post-types";
import { generateHospitalityPost } from "./generate";
import {
  buildHospitalityPrompt,
  composePost,
  findUnsupportedFigures,
  normaliseHashtags,
  parseHospitalityJson,
  readSettings,
  sanitiseCaption,
} from "./prompts";

const EM = String.fromCharCode(0x2014);
const EN = String.fromCharCode(0x2013);
const company = { name: "Lakeside", industry: "hospitality", description: null, settings: readSettings({ venue_notes: "A lakeside restaurant and bar with a covered terrace.", standing_hashtags: ["#SouthCerney"] }) };
const special = getPostType("special_of_the_day")!;
const weather = getPostType("weather_of_the_day")!;

describe("buildHospitalityPrompt", () => {
  const { system, user } = buildHospitalityPrompt({ company, postType: special, brief: "Sea bass, crushed potatoes, £22, until it runs out" });

  it("sets a hard source boundary and bans invented facts", () => {
    expect(system).toMatch(/SOURCE BOUNDARY/);
    expect(system).toMatch(/Never invent a price, a time, a date/);
  });
  it("asks for the hook on its own first line, British English, no dashes, no hashtags in the caption", () => {
    expect(system).toMatch(/first line is the hook/);
    expect(system).toMatch(/British English/);
    expect(system).toMatch(/No dashes used as punctuation/);
    expect(system).toMatch(/Do not put hashtags in the caption/);
  });
  it("carries no LinkedIn framing at all", () => {
    expect((system + user).toLowerCase()).not.toContain("linkedin");
  });
  it("puts the person's brief and the venue notes in front of the writer", () => {
    expect(user).toContain("Sea bass, crushed potatoes, £22");
    expect(user).toContain("covered terrace");
  });
  it("forbids emoji unless the venue wants them", () => {
    expect(system).toMatch(/Do not use emoji/);
    const withEmoji = buildHospitalityPrompt({ company: { ...company, settings: { ...company.settings, allow_emoji: true } }, postType: special, brief: "x" });
    expect(withEmoji.system).toMatch(/At most two emoji/);
  });
  it("gives the weather post only the forecast it was handed", () => {
    const p = buildHospitalityPrompt({ company, postType: weather, brief: "", forecastFacts: "High 14C, low 6C, light rain from noon" });
    expect(p.user).toContain("FORECAST (use only these figures): High 14C");
  });
  it("uses a length that suits the post type", () => {
    expect(system).toContain("between 35 and 80 words");
  });
});

describe("sanitiseCaption", () => {
  it("removes long dashes and keeps ranges readable", () => {
    const out = sanitiseCaption("Open 5" + EN + "9pm " + EM + " come early" + EM + "we fill up.", false);
    expect(out).not.toMatch(new RegExp(`[${EN}${EM}]`));
    expect(out).toContain("5-9pm");
  });
  it("strips emoji unless allowed, then caps at two", () => {
    expect(sanitiseCaption("Sunny day ☀️ \u{1F37D}", false)).toBe("Sunny day");
    const many = sanitiseCaption("a \u{1F600} b \u{1F601} c \u{1F602}", true);
    expect((many.match(/[\u{1F600}-\u{1F64F}]/gu) || []).length).toBe(2);
  });
  it("moves hashtags out of the body", () => {
    expect(sanitiseCaption("Lovely day #sunny out here", false)).toBe("Lovely day out here");
  });
});

describe("hashtags and composition", () => {
  it("adds the standing hashtags, drops duplicates and tidies the form", () => {
    expect(normaliseHashtags(["#sunny", "sunny day!", "#SunnY"], ["#SouthCerney"])).toEqual(["#sunny", "#sunnyday", "#SouthCerney"]);
  });
  it("puts the hashtag block after a blank line", () => {
    expect(composePost("Hello.", ["#a", "#b"])).toBe("Hello.\n\n#a #b");
    expect(composePost("Hello.", [])).toBe("Hello.");
  });
});

describe("parseHospitalityJson", () => {
  it("reads the agreed shape, fenced or not", () => {
    const j = JSON.stringify({ caption: "Hi", hashtags: ["#a"], alt_text: "A deck" });
    expect(parseHospitalityJson("```json\n" + j + "\n```").caption).toBe("Hi");
  });
  it("throws on anything else", () => {
    expect(() => parseHospitalityJson("Hi there")).toThrow();
    expect(() => parseHospitalityJson(JSON.stringify({ caption: "" }))).toThrow();
  });
});

describe("findUnsupportedFigures", () => {
  const supplied = "Pan-fried sea bass, £22, until 9pm. Wine tasting on 14th at 7pm.";
  it("passes figures that were supplied", () => {
    expect(findUnsupportedFigures("Sea bass for £22 until 9pm. Join us on the 14th at 7pm.", supplied)).toEqual([]);
  });
  it("flags a price, a time and a number that were not supplied", () => {
    const found = findUnsupportedFigures("Only £18, from 6pm, and just 12 tables left.", supplied);
    expect(found).toEqual(expect.arrayContaining(["£18", "6pm", "12"]));
  });
  it("does not trip on a number inside a supplied time", () => {
    expect(findUnsupportedFigures("Kitchen open until 9.", supplied)).toEqual([]);
  });
});

describe("generateHospitalityPost", () => {
  const brief = "Sea bass, crushed potatoes, £22, until it runs out";
  const reply = (caption: string) => ({ text: JSON.stringify({ caption, hashtags: ["#lunch"], alt_text: "Fish on a plate" }), provider: "gemini" as const, model: "x" });

  it("returns a clean post with the standing hashtags", async () => {
    const generator = vi.fn(async () => reply("Sea bass is on the board today.\n\nPan-fried and served with crushed potatoes, £22, and it will be there until it runs out. Come and sit with us on the terrace, order one at the bar, and let us look after the rest of your afternoon."));
    const post = await generateHospitalityPost({ companyId: "test-company", company, postType: special, brief }, generator as never);
    expect(post.warnings).toEqual([]);
    expect(post.body.endsWith("#lunch #SouthCerney")).toBe(true);
    expect(generator).toHaveBeenCalledTimes(1);
  });

  it("routes production text through the supplied company identity", async () => {
    const generator = vi.fn(async () => reply("Sea bass is on the board today, while it lasts."));
    await generateHospitalityPost({ companyId: "company-a", company, postType: special, brief }, generator as never);
    expect(generator).toHaveBeenCalledWith(expect.objectContaining({ companyId: "company-a" }));
  });

  it("asks again once when the writer invents a figure, then accepts the clean one", async () => {
    const generator = vi
      .fn()
      .mockResolvedValueOnce(reply("Sea bass, £18, from 6pm. Great today with the kitchen open until late tonight for everyone."))
      .mockResolvedValueOnce(reply("Sea bass with crushed potatoes, £22, while it lasts."));
    const post = await generateHospitalityPost({ companyId: "test-company", company, postType: special, brief }, generator as never);
    expect(generator).toHaveBeenCalledTimes(2);
    expect((generator.mock.calls[1][0] as { userPrompt: string }).userPrompt).toMatch(/£18, 6pm/);
    expect(post.caption).toContain("£22");
    expect(post.warnings.join(" ")).not.toMatch(/£18/);
  });

  it("flags the figure for a person if the writer keeps it", async () => {
    const generator = vi.fn(async () => reply("Sea bass for £18 today, with crushed potatoes, while it lasts at the lake."));
    const post = await generateHospitalityPost({ companyId: "test-company", company, postType: special, brief }, generator as never);
    expect(post.warnings.join(" ")).toMatch(/check £18/);
  });

  it("retries once on a reply that is not JSON", async () => {
    const generator = vi
      .fn()
      .mockResolvedValueOnce({ text: "Sure! Here is a post", provider: "claude", model: "x" })
      .mockResolvedValueOnce(reply("Sea bass, £22, while it lasts."));
    const post = await generateHospitalityPost({ companyId: "test-company", company, postType: special, brief }, generator as never);
    expect(post.caption).toContain("£22");
  });
});
