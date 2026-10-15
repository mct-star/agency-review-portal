import type { PieceMedia } from "@/lib/content/piece-media";
import { postDateFor } from "./post-date";
import { toLinkedInText } from "@/lib/linkedin/post-text";
import { toSocialText } from "./social-text";
import { networkFlags, networksFor } from "./networks";

/**
 * One row of the 88-column scheduler CSV (see the column list in
 * src/app/api/export/metricool/route.ts). Pure, so the rules can be tested:
 * which networks a post is flagged for, which text it carries, and the post
 * type the network needs. Cells come back raw; csvLine quotes every one.
 */

export const METRICOOL_HEADERS = [
  "Text",
  "Date",
  "Time",
  "Draft",
  "Facebook",
  "Twitter/X",
  "LinkedIn",
  "GBP",
  "Instagram",
  "Pinterest",
  "TikTok",
  "Youtube",
  "Threads",
  "Bluesky",
  "Picture Url 1",
  "Picture Url 2",
  "Picture Url 3",
  "Picture Url 4",
  "Picture Url 5",
  "Picture Url 6",
  "Picture Url 7",
  "Picture Url 8",
  "Picture Url 9",
  "Picture Url 10",
  "Alt text picture 1",
  "Alt text picture 2",
  "Alt text picture 3",
  "Alt text picture 4",
  "Alt text picture 5",
  "Alt text picture 6",
  "Alt text picture 7",
  "Alt text picture 8",
  "Alt text picture 9",
  "Alt text picture 10",
  "Document title",
  "Shortener",
  "Video Thumbnail Url",
  "Video Cover Frame",
  "Twitter/X Can reply",
  "Twitter/X Type",
  "Twitter/X Poll Duration minutes",
  "Twitter/X Poll Option 1",
  "Twitter/X Poll Option 2",
  "Twitter/X Poll Option 3",
  "Twitter/X Poll Option 4",
  "Pinterest Board",
  "Pinterest Pin Title",
  "Pinterest Pin Link",
  "Pinterest Pin New Format",
  "Instagram Post Type",
  "Instagram Show Reel On Feed",
  "Youtube Video Title",
  "Youtube Video Type",
  "Youtube Video Privacy",
  "Youtube video for kids",
  "Youtube Video Category",
  "Youtube Video Tags",
  "Youtube playlist",
  "GBP Post Type",
  "Facebook Post Type",
  "Facebook Title",
  "First Comment Text",
  "TikTok Title",
  "TikTok disable comments",
  "TikTok disable duet",
  "TikTok disable stitch",
  "TikTok Post Privacy",
  "TikTok Branded Content",
  "TikTok Your Brand",
  "TikTok Auto Add Music",
  "TikTok Photo Cover Index",
  "TikTok musicId",
  "TikTok title",
  "TikTok author",
  "TikTok startMillis",
  "TikTok durationMillis",
  "TikTok startVideoMillis",
  "LinkedIn Type",
  "LinkedIn Poll Question",
  "LinkedIn Poll Option 1",
  "LinkedIn Poll Option 2",
  "LinkedIn Poll Option 3",
  "LinkedIn Poll Option 4",
  "LinkedIn Poll Duration",
  "LinkedIn Show link preview",
  "LinkedIn Images as Carousel",
  "Threads Reply Control",
  "Brand name",
];

/**
 * Escape a string for CSV: wrap in double-quotes, double any internal quotes.
 * Convert \n to \r\n for Metricool compatibility.
 */
export function csvEscape(value: string): string {
  const normalized = value.replace(/\r\n/g, "\n").replace(/\n/g, "\r\n");
  return `"${normalized.replace(/"/g, '""')}"`;
}

/** One CSV line with every cell quoted, as the Mac pipeline writes it (QUOTE_ALL). */
export function csvLine(cells: string[]): string {
  return cells.map((c) => csvEscape(c)).join(",");
}

/**
 * The time a post gets when none is set. These are the Mac pipeline's own
 * defaults by kind of post: 10:30 for a social post, 13:00 for a podcast or clip.
 */
export function defaultTimeFor(postType: string | null | undefined): string {
  const t = (postType || "").toLowerCase();
  return t.includes("podcast") || t.includes("clip") ? "13:00:00" : "10:30:00";
}

/** CTA posts use link previews instead of images. */
function shouldShowLinkPreview(postType: string | null): boolean {
  return postType === "blog_cta" || postType === "triage_cta";
}

/** Only a tactical post with several images is a carousel. */
function isCarouselPost(postType: string | null, imageCount: number): boolean {
  return postType === "tactical" && imageCount > 1;
}

export interface RowPiece {
  markdown_body: string;
  first_comment: string | null;
  post_type: string | null;
  scheduled_time?: string | null;
  scheduled_date?: string | null;
  day_of_week?: string | number | null;
  title?: string | null;
  source_meta?: { alt_text?: string } | null;
}

export interface RowResult {
  cells: string[];
  /** Plain-words notes for the person exporting, for example a post with no photo. */
  notes: string[];
  /** Set when the post had no time and this default (HH:MM:SS) was used. */
  defaultedTime: string | null;
}

export function buildMetricoolRow(args: {
  piece: RowPiece;
  weekStart: string;
  isDraft: boolean;
  companyNetworks: string[] | null | undefined;
  media: PieceMedia;
  /** Alt text per picture, falling back to the title. */
  altTexts: string[];
}): RowResult {
  const { piece, media } = args;
  const networks = networksFor(args.companyNetworks);
  const { flags, instagramSkipped } = networkFlags(networks, media.items.length > 0);
  const notes: string[] = [];
  const label = piece.title || "A post";

  if (instagramSkipped) notes.push(`${label} has no photo, so it goes to the other networks only. Instagram needs a picture.`);
  if (!flags.facebook && !flags.instagram && !flags.linkedin && !flags.twitter && !flags.threads && !flags.bluesky && !flags.tiktok && !flags.gbp) {
    notes.push(`${label} has no network to go to.`);
  }

  const row = new Array(88).fill("");
  // Text: LinkedIn alone keeps its house style (no hashtags); any other
  // network gets the plain text with the hashtag block kept.
  const linkedinOnly = networks.length === 1 && networks[0] === "linkedin";
  const toText = linkedinOnly ? toLinkedInText : toSocialText;
  row[0] = toText(piece.markdown_body);
  row[1] = postDateFor(piece, args.weekStart);
  let defaultedTime: string | null = null;
  if (piece.scheduled_time) {
    row[2] = piece.scheduled_time.length === 5 ? piece.scheduled_time + ":00" : piece.scheduled_time;
  } else {
    defaultedTime = defaultTimeFor(piece.post_type);
    row[2] = defaultedTime;
  }
  row[3] = args.isDraft ? "true" : "false";

  row[4] = String(flags.facebook);
  row[5] = String(flags.twitter);
  row[6] = String(flags.linkedin);
  row[7] = String(flags.gbp);
  row[8] = String(flags.instagram);
  row[9] = "false";
  row[10] = String(flags.tiktok);
  row[11] = "false";
  row[12] = String(flags.threads);
  row[13] = String(flags.bluesky);

  for (let i = 0; i < Math.min(media.items.length, 10); i++) {
    row[14 + i] = media.items[i].url || "";
    row[24 + i] = args.altTexts[i] || "";
  }

  if (piece.first_comment) row[61] = toText(piece.first_comment);

  // Post types the networks need: Instagram and Facebook take POST, REEL or STORY.
  const isVideo = media.shape === "video";
  if (flags.instagram) row[49] = isVideo ? "REEL" : "POST";
  if (flags.facebook) row[59] = isVideo ? "REEL" : "POST";

  if (flags.linkedin) {
    row[77] = "POST";
    row[84] = shouldShowLinkPreview(piece.post_type) ? "true" : "false";
    row[85] = isCarouselPost(piece.post_type, media.items.length) ? "true" : "false";
  } else {
    row[84] = "false";
    row[85] = "false";
  }

  return { cells: row, notes, defaultedTime };
}
