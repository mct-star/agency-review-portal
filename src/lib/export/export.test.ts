import { describe, expect, it } from "vitest";
import { buildMetricoolRow, csvEscape, csvLine, defaultTimeFor, METRICOOL_HEADERS } from "./metricool-row";
import { networkFlags, networksFor } from "./networks";
import { toSocialText } from "./social-text";
import type { PieceMedia } from "@/lib/content/piece-media";

const none: PieceMedia = { shape: "none", items: [] };
const one: PieceMedia = { shape: "image", items: [{ kind: "image", url: "https://cdn.example.com/a.jpg", alt: "Special" }] };
const video: PieceMedia = { shape: "video", items: [{ kind: "video", url: "https://cdn.example.com/a.mp4", alt: "Clip" }] };

const piece = {
  markdown_body: "Sea bass today.\n\nCrushed potatoes, £22.\n\n#lunch #SouthCerney",
  first_comment: null,
  post_type: "special_of_the_day",
  scheduled_date: "2026-10-14",
  scheduled_time: "12:00",
  title: "Special of the day",
};

const col = (cells: string[], name: string) => cells[METRICOOL_HEADERS.indexOf(name)];

describe("the CSV shape", () => {
  it("has 88 columns", () => {
    expect(METRICOOL_HEADERS).toHaveLength(88);
  });
});

describe("a company with no networks chosen (LinkedIn, as before)", () => {
  it("posts to LinkedIn only, with LinkedIn text and no hashtags", () => {
    const { cells } = buildMetricoolRow({ piece, weekStart: "2026-10-12", isDraft: false, companyNetworks: [], media: one, altTexts: ["Special"] });
    expect(col(cells, "LinkedIn")).toBe("true");
    expect(col(cells, "Facebook")).toBe("false");
    expect(col(cells, "Instagram")).toBe("false");
    expect(col(cells, "LinkedIn Type")).toBe("POST");
    expect(col(cells, "Text")).not.toContain("#lunch");
    expect(col(cells, "Instagram Post Type")).toBe("");
  });
  it("defaults a social post with no time to 10:30 and says so", () => {
    const { cells, defaultedTime } = buildMetricoolRow({ piece: { ...piece, scheduled_time: null }, weekStart: "2026-10-12", isDraft: true, companyNetworks: null, media: none, altTexts: [] });
    expect(col(cells, "Time")).toBe("10:30:00");
    expect(defaultedTime).toBe("10:30:00");
    expect(col(cells, "Draft")).toBe("true");
  });
  it("defaults a podcast or clip with no time to 13:00", () => {
    expect(defaultTimeFor("podcast_clip")).toBe("13:00:00");
    expect(defaultTimeFor("video_clip")).toBe("13:00:00");
    expect(defaultTimeFor("tactical")).toBe("10:30:00");
    expect(defaultTimeFor(null)).toBe("10:30:00");
  });
  it("reports no default when the piece has a time", () => {
    const { defaultedTime } = buildMetricoolRow({ piece, weekStart: "2026-10-12", isDraft: false, companyNetworks: null, media: none, altTexts: [] });
    expect(defaultedTime).toBeNull();
  });
  it("quotes every cell, empty ones included", () => {
    const { cells } = buildMetricoolRow({ piece, weekStart: "2026-10-12", isDraft: false, companyNetworks: null, media: none, altTexts: [] });
    const line = csvLine(cells);
    expect(line.startsWith('"')).toBe(true);
    expect(line.endsWith('"')).toBe(true);
    expect(line.split('","')).toHaveLength(88);
    expect(csvLine(["a", "", "b"])).toBe('"a","","b"');
  });
});

describe("a hospitality company (Facebook and Instagram)", () => {
  const args = { piece, weekStart: "2026-10-12", isDraft: false, companyNetworks: ["facebook", "instagram"], altTexts: ["A plate of sea bass"] };

  it("flags Facebook and Instagram and not LinkedIn", () => {
    const { cells } = buildMetricoolRow({ ...args, media: one });
    expect(col(cells, "Facebook")).toBe("true");
    expect(col(cells, "Instagram")).toBe("true");
    expect(col(cells, "LinkedIn")).toBe("false");
    expect(col(cells, "LinkedIn Type")).toBe("");
  });
  it("carries the scheduled date and time and the hashtag block", () => {
    const { cells } = buildMetricoolRow({ ...args, media: one });
    expect(col(cells, "Date")).toBe("2026-10-14");
    expect(col(cells, "Time")).toBe("12:00:00");
    expect(col(cells, "Text")).toContain("#lunch #SouthCerney");
  });
  it("sets the post type each network needs", () => {
    const img = buildMetricoolRow({ ...args, media: one }).cells;
    expect(col(img, "Instagram Post Type")).toBe("POST");
    expect(col(img, "Facebook Post Type")).toBe("POST");
    const vid = buildMetricoolRow({ ...args, media: video }).cells;
    expect(col(vid, "Instagram Post Type")).toBe("REEL");
  });
  it("puts the photo and its alt text in the picture columns", () => {
    const { cells } = buildMetricoolRow({ ...args, media: one });
    expect(col(cells, "Picture Url 1")).toBe("https://cdn.example.com/a.jpg");
    expect(col(cells, "Alt text picture 1")).toBe("A plate of sea bass");
  });
  it("drops Instagram, keeps Facebook, and says so when a post has no photo", () => {
    const r = buildMetricoolRow({ ...args, media: none });
    expect(col(r.cells, "Instagram")).toBe("false");
    expect(col(r.cells, "Facebook")).toBe("true");
    expect(col(r.cells, "Instagram Post Type")).toBe("");
    expect(r.notes.join(" ")).toMatch(/Special of the day has no photo/);
  });
  it("warns when a post would go nowhere", () => {
    const r = buildMetricoolRow({ ...args, companyNetworks: ["instagram"], media: none });
    expect(r.notes.join(" ")).toMatch(/no network/);
  });
});

describe("networks", () => {
  it("defaults to LinkedIn", () => {
    expect(networksFor(undefined)).toEqual(["linkedin"]);
    expect(networksFor([])).toEqual(["linkedin"]);
    expect(networksFor(["facebook"])).toEqual(["facebook"]);
  });
  it("only enables Instagram when there is media", () => {
    expect(networkFlags(["instagram"], false).flags.instagram).toBe(false);
    expect(networkFlags(["instagram"], true).flags.instagram).toBe(true);
  });
});

describe("text", () => {
  it("keeps hashtags and drops markdown", () => {
    expect(toSocialText("**Hi** there\n\n#a #b")).toBe("Hi there\n\n#a #b");
  });
  it("escapes quotes for CSV", () => {
    expect(csvEscape('say "hi"')).toBe('"say ""hi"""');
  });
});
