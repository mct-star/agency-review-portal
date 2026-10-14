import { describe, expect, it } from "vitest";
import { buildMetricoolRow, METRICOOL_HEADERS } from "./metricool-row";
import type { PieceMedia } from "@/lib/content/piece-media";

/**
 * The fields Metricool documents for its CSV template, copied from
 * help.metricool.com "How to schedule posts in batch with a CSV file", annex
 * "Available Fields in the Template" (read 14 Oct 2026), with "up to N"
 * fields expanded. The downloadable template is the real authority on order;
 * this is the published list.
 */
const range = (prefix: string, n: number) => Array.from({ length: n }, (_, i) => `${prefix} ${i + 1}`);
const DOCUMENTED = [
  "Text", "Date", "Time", "Draft", "Facebook", "Twitter/X", "LinkedIn", "GBP", "Instagram", "Pinterest", "TikTok", "YouTube", "Threads", "Bluesky",
  ...range("Picture Url", 10), ...range("Alt text picture", 10),
  "Document title", "Shortener", "Video Thumbnail Url", "Video Cover Frame",
  "Twitter/X Can reply", "Twitter/X Type", "Twitter/X Poll Duration minutes", ...range("Twitter/X Poll Option", 4),
  "Pinterest Board", "Pinterest Pin Title", "Pinterest Pin Link", "Pinterest Pin New Format",
  "Instagram Post Type", "Instagram Show Reel On Feed",
  "YouTube Video Title", "YouTube Video Type", "YouTube Video Privacy", "YouTube video for kids", "YouTube Video Category", "YouTube Video Tags", "YouTube Playlist", "YouTube Notify Subscribers",
  "GBP Post Type", "Facebook Post Type", "Facebook Title", "First Comment Text",
  "TikTok Title", "TikTok disable comments", "TikTok disable duet", "TikTok disable stitch", "TikTok Post Privacy", "TikTok Branded Content", "TikTok Your Brand", "TikTok Auto Add Music", "TikTok Photo Cover Index",
  "TikTok musicId", "TikTok music title", "TikTok music author", "TikTok music previewUrl", "TikTok music thumbnailUrl", "TikTok music soundVolume", "TikTok music originalVolume", "TikTok music startMillis", "TikTok music endMillis",
  "LinkedIn Type", "LinkedIn Poll Question", ...range("LinkedIn Poll Option", 4), "LinkedIn Poll Duration", "LinkedIn Show link preview", "LinkedIn Images as Carousel",
  "Threads Reply Control", "Threads Is Spoiler", "Threads Post Type", "Brand name",
];

const norm = (s: string) => s.toLowerCase();

describe("headers against Metricool's published field list", () => {
  const ours = new Set(METRICOOL_HEADERS.map(norm));
  const theirs = new Set(DOCUMENTED.map(norm));
  const missing = DOCUMENTED.filter((h) => !ours.has(norm(h)));
  const extra = METRICOOL_HEADERS.filter((h) => !theirs.has(norm(h)));

  it("has every field the export fills in (text, date, time, networks, pictures, post types, first comment)", () => {
    const used = ["Text", "Date", "Time", "Draft", "Facebook", "LinkedIn", "Instagram", "Picture Url 1", "Alt text picture 1", "Instagram Post Type", "Facebook Post Type", "First Comment Text", "LinkedIn Type"];
    for (const h of used) expect(ours.has(norm(h)), h).toBe(true);
  });

  it("records the known difference from the published list, so a change in either shows up here", () => {
    // Fields Metricool now publishes that this export does not have (all unused by it).
    expect(missing).toEqual([
      "YouTube Notify Subscribers",
      "TikTok music title",
      "TikTok music author",
      "TikTok music previewUrl",
      "TikTok music thumbnailUrl",
      "TikTok music soundVolume",
      "TikTok music originalVolume",
      "TikTok music startMillis",
      "TikTok music endMillis",
      "Threads Is Spoiler",
      "Threads Post Type",
    ]);
    // Older names this export still carries that the published list no longer has.
    expect(extra).toEqual(["TikTok author", "TikTok startMillis", "TikTok durationMillis", "TikTok startVideoMillis"]);
  });
});

describe("row values against Metricool's documented formats", () => {
  const photo: PieceMedia = { shape: "image", items: [{ kind: "image", url: "https://abc.supabase.co/storage/v1/object/public/content-assets/images/co/p/x.jpg", alt: "A terrace" }] };
  const piece = { markdown_body: "Sea bass today.\n\n#lunch", first_comment: null, post_type: "special_of_the_day", scheduled_date: "2026-10-14", scheduled_time: "07:00", title: "Special" };
  const { cells } = buildMetricoolRow({ piece, weekStart: "2026-10-12", isDraft: false, companyNetworks: ["facebook", "instagram"], media: photo, altTexts: ["A terrace"] });
  const col = (name: string) => cells[METRICOOL_HEADERS.indexOf(name)];

  it("uses the date and time formats the importer is told to expect (YYYY-MM-DD and HH:MM:SS)", () => {
    expect(col("Date")).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(col("Time")).toMatch(/^\d{2}:\d{2}:\d{2}$/);
  });
  it("fills network columns with true or false only", () => {
    for (const n of ["Facebook", "Twitter/X", "LinkedIn", "GBP", "Instagram", "Pinterest", "TikTok", "Youtube", "Threads", "Bluesky", "Draft"]) {
      expect(["true", "false"], n).toContain(col(n));
    }
  });
  it("uses post types the importer accepts", () => {
    expect(["POST", "REEL", "TRIAL_REEL", "STORY"]).toContain(col("Instagram Post Type"));
    expect(["POST", "REEL", "STORY"]).toContain(col("Facebook Post Type"));
  });
  it("points picture columns at a public https file, one per column, no more than ten", () => {
    expect(col("Picture Url 1")).toMatch(/^https:\/\/.+\.(jpg|png|mp4)$/);
    expect(cells.slice(14, 24).filter(Boolean).length).toBeLessThanOrEqual(10);
  });
  it("never writes the word false into the first comment, which Metricool would publish literally", () => {
    expect(col("First Comment Text")).toBe("");
  });
  it("has exactly one cell per header", () => {
    expect(cells).toHaveLength(METRICOOL_HEADERS.length);
  });
});
