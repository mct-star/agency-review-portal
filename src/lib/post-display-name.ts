/**
 * Generates a human-readable display name for content pieces.
 *
 * Instead of just showing the topic title ("The 73% problem: why most
 * healthcare launches miss forecasting targets"), this creates a
 * contextual label like "Mon Problem — Healthcare launch forecasting"
 *
 * Used in: compliance/regulatory views, content review lists, week overview
 */

const POST_TYPE_SHORT_LABELS: Record<string, string> = {
  insight: "Problem",
  launch_story: "Launch Story",
  if_i_was: "If I Was",
  contrarian: "Contrarian",
  tactical: "Tactical",
  founder_friday: "Founder",
  blog_teaser: "Blog Teaser",
  blog_cta: "Blog CTA",
  triage_cta: "Triage CTA",
  blog_article: "Blog",
  linkedin_article: "Article",
  pdf_guide: "PDF Guide",
  video_script: "Video",
};

const DAY_SHORT: Record<string, string> = {
  Sunday: "Sun",
  Monday: "Mon",
  Tuesday: "Tue",
  Wednesday: "Wed",
  Thursday: "Thu",
  Friday: "Fri",
  Saturday: "Sat",
};

/**
 * Create a display name for a content piece.
 *
 * Examples:
 * - "Mon Problem — Healthcare launch forecasting"
 * - "Wed If I Was — Demand gen for diagnostics"
 * - "Fri Founder — Fantasy vs reality of pipeline"
 * - "Blog — The real cost of a rep visit"
 */
export function getPostDisplayName(options: {
  title: string;
  postType?: string | null;
  dayOfWeek?: string | null;
  contentType?: string | null;
}): string {
  const { title, postType, dayOfWeek, contentType } = options;

  // Get the short post type label
  const typeLabel = postType
    ? POST_TYPE_SHORT_LABELS[postType] || postType
    : contentType
    ? POST_TYPE_SHORT_LABELS[contentType] || contentType
    : null;

  // Get the day prefix
  const dayPrefix = dayOfWeek ? DAY_SHORT[dayOfWeek] || dayOfWeek.slice(0, 3) : null;

  // Shorten the title (remove common prefixes, truncate)
  let shortTitle = title;
  // Remove "The X problem:" pattern
  shortTitle = shortTitle.replace(/^The \d+%? problem:\s*/i, "");
  // Remove "Why most..." pattern
  shortTitle = shortTitle.replace(/^Why most\s+/i, "");
  // Remove leading "How to..."
  shortTitle = shortTitle.replace(/^How to\s+/i, "");
  // Capitalize first letter
  shortTitle = shortTitle.charAt(0).toUpperCase() + shortTitle.slice(1);
  // Truncate to ~50 chars
  if (shortTitle.length > 50) {
    shortTitle = shortTitle.slice(0, 47) + "...";
  }

  // Build the display name
  const parts: string[] = [];
  if (dayPrefix) parts.push(dayPrefix);
  if (typeLabel) parts.push(typeLabel);

  if (parts.length > 0) {
    return `${parts.join(" ")} — ${shortTitle}`;
  }

  return shortTitle;
}

/**
 * Get just the type badge text (for compact displays)
 */
export function getPostTypeBadge(postType: string | null | undefined): {
  label: string;
  color: string;
} {
  const badges: Record<string, { label: string; color: string }> = {
    insight: { label: "Problem", color: "#CDD856" },
    launch_story: { label: "Launch", color: "#41CDA9" },
    if_i_was: { label: "If I Was", color: "#A27BF9" },
    contrarian: { label: "Contrarian", color: "#41C9FE" },
    tactical: { label: "Tactical", color: "#CDD856" },
    founder_friday: { label: "Founder", color: "#F59E0B" },
    blog_teaser: { label: "Teaser", color: "#6B7280" },
    blog_cta: { label: "CTA", color: "#6B7280" },
    triage_cta: { label: "Triage", color: "#EC4899" },
    blog_article: { label: "Blog", color: "#0EA5E9" },
    linkedin_article: { label: "Article", color: "#0A66C2" },
    pdf_guide: { label: "PDF", color: "#EF4444" },
    video_script: { label: "Video", color: "#8B5CF6" },
  };

  return badges[postType || ""] || { label: postType || "Post", color: "#6B7280" };
}
