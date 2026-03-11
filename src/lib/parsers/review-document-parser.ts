import type { ContentType } from "@/types/database";

export interface ParsedPiece {
  content_type: ContentType;
  title: string;
  day_of_week: string | null;
  scheduled_time: string | null;
  markdown_body: string;
  first_comment: string | null;
  pillar: string | null;
  audience_theme: string | null;
  topic_bank_ref: string | null;
  word_count: number | null;
  post_type: string | null;
  sort_order: number;
}

export interface ParsedWeek {
  week_number: number | null;
  date_start: string | null;
  date_end: string | null;
  title: string | null;
  pillar: string | null;
  theme: string | null;
  pieces: ParsedPiece[];
}

// Extract metadata value from lines like "**Word count:** 153 words"
function extractMeta(text: string, key: string): string | null {
  const patterns = [
    new RegExp(`\\*\\*${key}:\\*\\*\\s*(.+)`, "i"),
    new RegExp(`${key}:\\s*(.+)`, "i"),
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return match[1].trim();
  }
  return null;
}

// Parse word count from string like "153 words" or "2,150"
function parseWordCount(text: string | null): number | null {
  if (!text) return null;
  const cleaned = text.replace(/[,\s]|words?/gi, "");
  const num = parseInt(cleaned, 10);
  return isNaN(num) ? null : num;
}

// Parse the week header for metadata
function parseWeekHeader(text: string): Partial<ParsedWeek> {
  const result: Partial<ParsedWeek> = {};

  // Week number: "# WEEK 11 REVIEW DOCUMENT"
  const weekMatch = text.match(/WEEK\s+(\d+)/i);
  if (weekMatch) result.week_number = parseInt(weekMatch[1], 10);

  // Date range: "## 15 March - 21 March 2026"
  const dateMatch = text.match(/##\s+(\d+\s+\w+)\s*[-–]\s*(\d+\s+\w+\s+\d{4})/);
  if (dateMatch) {
    // Store as raw strings — the upload form will handle proper date conversion
    result.date_start = dateMatch[1] + " " + dateMatch[2].split(" ").pop();
    result.date_end = dateMatch[2];
  }

  // Title: "## BOOK LAUNCH WEEK"
  const titleMatch = text.match(/##\s+([A-Z][A-Z\s()]+)(?:\n|$)/m);
  if (titleMatch && !titleMatch[1].includes("PART") && !titleMatch[1].includes("REVIEW")) {
    result.title = titleMatch[1].trim();
  }

  // Pillar
  const pillarMatch = text.match(/\*?Pillar:\s*([A-Z0-9,\s+]+)/i);
  if (pillarMatch) result.pillar = pillarMatch[1].trim().split(/\s*[(\n]/)[0].trim();

  // Theme
  const themeMatch = text.match(/\*?Theme:\s*([A-Z,\s]+)/i);
  if (themeMatch) result.theme = themeMatch[1].trim().split(/\s*[(\n]/)[0].trim();

  return result;
}

// Parse a social post section
function parseSocialPost(section: string, sortOrder: number): ParsedPiece | null {
  // Header pattern: "## SUNDAY 15 MARCH | 09:00 | Blog Teaser + Book Launch"
  // or: "## MONDAY 16 MARCH | 09:00 | Problem Agitation"
  const headerMatch = section.match(
    /##\s+(SUNDAY|MONDAY|TUESDAY|WEDNESDAY|THURSDAY|FRIDAY|SATURDAY)\s+.*?\|\s*(\d{2}:\d{2})\s*\|\s*(.+)/i
  );

  if (!headerMatch) return null;

  const day = headerMatch[1].toLowerCase();
  const time = headerMatch[2];
  const postType = headerMatch[3].trim();

  // Check for AM/PM suffix in the section
  const dayOfWeek = section.match(/MONDAY AM/i)
    ? "monday_am"
    : section.match(/MONDAY PM/i)
      ? "monday_pm"
      : section.match(/WEDNESDAY AM/i)
        ? "wednesday_am"
        : section.match(/WEDNESDAY PM/i)
          ? "wednesday_pm"
          : section.match(/THURSDAY AM/i)
            ? "thursday_am"
            : section.match(/THURSDAY PM/i)
              ? "thursday_pm"
              : day;

  // Extract post text (between "### Post Text" and the next "---" or metadata line)
  let postText = "";
  const postTextMatch = section.match(/###\s*Post Text\s*\n([\s\S]*?)(?=\n---|\n\*\*Word count|\n\*\*First Comment)/i);
  if (postTextMatch) {
    postText = postTextMatch[1].trim();
  }

  // Extract metadata
  const pillarMatch = section.match(/\*\*Pillar:\*\*\s*([^\n|*]+)/i);
  const themeMatch = section.match(/\*\*Theme:\*\*\s*([^\n|*]+)/i);
  const tbMatch = section.match(/\*\*TB#:\*\*\s*(\d+)/i);
  const wordCount = extractMeta(section, "Word count");
  const firstComment = extractMeta(section, "First Comment");
  const postTypeFromMeta = extractMeta(section, "Post Type");

  const title = `${day.charAt(0).toUpperCase() + day.slice(1)}${dayOfWeek.includes("_") ? " " + dayOfWeek.split("_")[1].toUpperCase() : ""} — ${postType}`;

  return {
    content_type: "social_post",
    title,
    day_of_week: dayOfWeek,
    scheduled_time: time,
    markdown_body: postText || section,
    first_comment: firstComment,
    pillar: pillarMatch ? pillarMatch[1].trim() : null,
    audience_theme: themeMatch ? themeMatch[1].trim() : null,
    topic_bank_ref: tbMatch ? `TB#${tbMatch[1]}` : null,
    word_count: parseWordCount(wordCount),
    post_type: (postTypeFromMeta || postType).replace(/\(.*\)/, "").trim(),
    sort_order: sortOrder,
  };
}

// Parse anchor content (blog, LinkedIn article, PDF guide)
function parseAnchorPiece(
  section: string,
  type: ContentType,
  sortOrder: number
): ParsedPiece | null {
  // Title from "## Blog Article: It's Not a Sales Problem"
  const titleMatch = section.match(
    /##\s+(?:Blog Article|LinkedIn Article|PDF Guide Brief)[:\s]*(.+)?/i
  );
  const title = titleMatch?.[1]?.trim() || type.replace("_", " ");

  const wordCount = extractMeta(section, "Word count");

  return {
    content_type: type,
    title,
    day_of_week: null,
    scheduled_time: null,
    markdown_body: section.trim(),
    first_comment: null,
    pillar: null,
    audience_theme: null,
    topic_bank_ref: null,
    word_count: parseWordCount(wordCount),
    post_type: null,
    sort_order: sortOrder,
  };
}

export function parseReviewDocument(markdown: string): ParsedWeek {
  const header = parseWeekHeader(markdown);

  const pieces: ParsedPiece[] = [];
  let sortOrder = 0;

  // Split into parts
  const partOneMatch = markdown.match(
    /# PART ONE:.*?\n([\s\S]*?)(?=# PART TWO|$)/i
  );
  const partTwoMatch = markdown.match(
    /# PART TWO:.*?\n([\s\S]*?)(?=# PART THREE|## PART THREE|$)/i
  );

  // Parse anchor content from Part One
  if (partOneMatch) {
    const partOne = partOneMatch[1];

    // Blog Article
    const blogMatch = partOne.match(
      /## Blog Article[:\s]*([\s\S]*?)(?=## LinkedIn|## PDF|## Video|$)/i
    );
    if (blogMatch) {
      const piece = parseAnchorPiece(blogMatch[0], "blog_article", sortOrder++);
      if (piece) pieces.push(piece);
    }

    // LinkedIn Article
    const linkedinMatch = partOne.match(
      /## LinkedIn Article[:\s]*([\s\S]*?)(?=## PDF|## Video|## Blog|$)/i
    );
    if (linkedinMatch) {
      const piece = parseAnchorPiece(linkedinMatch[0], "linkedin_article", sortOrder++);
      if (piece) pieces.push(piece);
    }

    // PDF Guide
    const pdfMatch = partOne.match(
      /## PDF Guide[:\s]*([\s\S]*?)(?=## Blog|## LinkedIn|## Video|$)/i
    );
    if (pdfMatch) {
      const piece = parseAnchorPiece(pdfMatch[0], "pdf_guide", sortOrder++);
      if (piece) pieces.push(piece);
    }
  }

  // Parse social posts from Part Two
  if (partTwoMatch) {
    const partTwo = partTwoMatch[1];

    // Split on "## DAY" headers
    const postSections = partTwo.split(/(?=##\s+(?:SUNDAY|MONDAY|TUESDAY|WEDNESDAY|THURSDAY|FRIDAY|SATURDAY))/i);

    for (const section of postSections) {
      if (section.trim().length < 10) continue;
      const piece = parseSocialPost(section, sortOrder++);
      if (piece) pieces.push(piece);
    }
  }

  return {
    week_number: header.week_number || null,
    date_start: header.date_start || null,
    date_end: header.date_end || null,
    title: header.title || null,
    pillar: header.pillar || null,
    theme: header.theme || null,
    pieces,
  };
}

// Parse Star Linen individual post format
export function parseIndividualPost(markdown: string, sortOrder: number): ParsedPiece | null {
  const titleMatch = markdown.match(/^#\s+(.+)/m);
  const title = titleMatch?.[1]?.trim() || "Untitled Post";

  const dayMatch = markdown.match(/(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)/i);
  const day = dayMatch ? dayMatch[1].toLowerCase() : null;

  const wordCount = extractMeta(markdown, "Word count");
  const firstComment = extractMeta(markdown, "First Comment") || extractMeta(markdown, "First comment");
  const pillarMatch = markdown.match(/Pillar:\s*([^\n]+)/i);
  const themeMatch = markdown.match(/Theme:\s*([^\n]+)/i);

  return {
    content_type: "social_post",
    title,
    day_of_week: day,
    scheduled_time: null,
    markdown_body: markdown,
    first_comment: firstComment,
    pillar: pillarMatch ? pillarMatch[1].trim() : null,
    audience_theme: themeMatch ? themeMatch[1].trim() : null,
    topic_bank_ref: null,
    word_count: parseWordCount(wordCount),
    post_type: null,
    sort_order: sortOrder,
  };
}
