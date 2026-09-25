/**
 * An approved blog, as the files agency-website serves it from
 * (25 Sept 2026). Pure, so the publish route's dry run and its tests see
 * exactly what the pull request will contain.
 *
 * The website's contract (agency-website src/lib/blog.ts and its tests):
 *   src/content/blog/<slug>.mdx, frontmatter slug, title, seoTitle,
 *     description, date, readTime, author, heroImage?, ogImage?, ctaCluster
 *   public/images/blog/<slug>.<ext>     the hero, text-free editorial, never 1200x630
 *   public/images/blog/<slug>-og.<ext>  the 1200x630 share card
 *   ctaCluster must map to a service page (blog-service-links.ts)
 * MDX reads "{" as code and "<" as a component, and the site registers only
 * YouTubeEmbed, so both are escaped in the body.
 */

export const CTA_CLUSTERS = [
  { code: "demand-problem", label: "Demand problem (services)" },
  { code: "launch", label: "Product launch" },
  { code: "events", label: "Congress and events" },
  { code: "sales-enablement", label: "Sales enablement" },
  { code: "market-entry", label: "New market entry" },
  { code: "attention-economy", label: "Attention economy (copywriting)" },
  { code: "alignment", label: "Sales and marketing alignment" },
] as const;

export const WEBSITE_BLOG_BASE = "https://agencymedicalmarketing.com/blog";

export function slugify(text: string): string {
  return text.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80).replace(/-+$/, "");
}

export function readTimeFor(words: number): string {
  return `${Math.max(1, Math.round(words / 230))} min read`;
}

/** A body ready for MDX: no repeated H1 title, and nothing MDX would read as code or a component. */
export function mdxBody(markdown: string, title: string): string {
  const lines = markdown.replace(/\r\n/g, "\n").trim().split("\n");
  if (lines[0]?.replace(/^#\s+/, "").trim() === title.trim() && lines[0].startsWith("# ")) lines.shift();
  return lines.join("\n").trim()
    .replace(/([{}])/g, "\\$1")
    .replace(/<(?=[A-Za-z/!])/g, "\\<") + "\n";
}

const yaml = (v: string) => JSON.stringify(v); // a double-quoted YAML scalar

export interface BlogFrontmatter {
  slug: string;
  title: string;
  seoTitle: string;
  description: string;
  date: string;
  readTime: string;
  author: string;
  heroImage?: string | null;
  ogImage?: string | null;
  ctaCluster: string;
}

export function buildBlogMdx(fm: BlogFrontmatter, body: string): string {
  const lines = [
    "---",
    `slug: ${fm.slug}`,
    `title: ${yaml(fm.title)}`,
    `seoTitle: ${yaml(fm.seoTitle)}`,
    `description: ${yaml(fm.description)}`,
    `date: ${fm.date}`,
    `readTime: ${fm.readTime}`,
    `author: ${fm.author}`,
    ...(fm.heroImage ? [`heroImage: ${fm.heroImage}`] : []),
    ...(fm.ogImage ? [`ogImage: ${fm.ogImage}`] : []),
    `ctaCluster: ${fm.ctaCluster}`,
    "---",
  ];
  return `${lines.join("\n")}\n\n${mdxBody(body, fm.title)}`;
}

/** The file extension of an image URL, defaulting to png. */
export function imageExt(url: string): string {
  const m = url.split("?")[0].match(/\.(png|jpe?g|webp)$/i);
  return m ? m[1].toLowerCase().replace("jpeg", "jpg") : "png";
}

/** Why this blog cannot go to the website yet; empty when it can. */
export function publishProblems(p: {
  approved: boolean; contentType: string; title: string; body: string; slug: string; ctaCluster: string; heroUrl: string | null;
}): string[] {
  const out: string[] = [];
  if (p.contentType !== "blog_article") out.push("Only blog articles go to the website.");
  if (!p.approved) out.push("Approve the blog first.");
  if (!p.slug) out.push("The blog has no URL slug.");
  if (!CTA_CLUSTERS.some(c => c.code === p.ctaCluster)) out.push("Choose the service the blog points readers to.");
  if (/[–—]/.test(p.title + p.body)) out.push("The blog contains an em or en dash; edit it out first.");
  if (/[:]/.test(p.title)) out.push("The title contains a colon.");
  if (!p.heroUrl) out.push("Generate the hero image first; every post on the site carries one.");
  return out;
}
