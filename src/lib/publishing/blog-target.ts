import { decryptJson } from "@/lib/crypto";
import { CTA_CLUSTERS, WEBSITE_BLOG_BASE } from "@/lib/publishing/website-blog";

/**
 * Where a company's approved blog goes (15 Nov 2026): the repository, base
 * branch, content and image folders, live address, author fallback and
 * service list the publish route uses. It is read from the company's
 * active company_api_configs row (service_category blog_publishing,
 * provider github_pull_request, settings in provider_settings, the GitHub
 * token encrypted in credentials_encrypted as { "token": "..." }).
 *
 * With no row the legacy target applies, which is today's publisher
 * exactly: the env values and constants the route used before. Setting
 * WEBSITE_LEGACY_TARGET_COMPANY_ID limits that fallback to the one company
 * it names; any other company with no row is then refused. Unset, every
 * company falls back as before.
 */

export interface BlogPublishTarget {
  provider: "github_pull_request";
  repo: string;
  baseBranch: string;
  contentPath: string;
  imagePath: string;
  liveBaseUrl: string;
  defaultAuthor: string | null;
  ctaClusters: Array<{ code: string; label: string }>;
  source: "company_config" | "legacy_default";
}

export const BLOG_PUBLISHING_CATEGORY = "blog_publishing";
export const BLOG_PUBLISHING_PROVIDER = "github_pull_request";
export const NO_TARGET_REFUSAL = "This company has no website publishing target set up yet.";

/**
 * Today's publisher. A function, not a constant, because the repository
 * comes from an env var the route has always read on each request.
 */
export function legacyBlogTarget(): BlogPublishTarget {
  return {
    provider: "github_pull_request",
    repo: process.env.WEBSITE_GITHUB_REPO || "mct-star/agency-website",
    baseBranch: "main",
    contentPath: "src/content/blog",
    imagePath: "public/images/blog",
    liveBaseUrl: WEBSITE_BLOG_BASE,
    defaultAuthor: "Michael Colling-Tuck",
    ctaClusters: CTA_CLUSTERS.map(c => ({ code: c.code, label: c.label })),
    source: "legacy_default",
  };
}

const REPO = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const BRANCH = /^[A-Za-z0-9._/-]+$/;
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

function folder(value: unknown, fallback: string, field: string): string | { error: string } {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value !== "string") return { error: `The website target's ${field} must be text.` };
  const v = value.trim().replace(/\/+$/, "");
  if (!v || v.startsWith("/") || v.split("/").includes("..") || v.includes("\\")) {
    return { error: `The website target's ${field} must be a folder inside the repository, with no leading slash and no "..".` };
  }
  return v;
}

/** Checks a row's provider_settings. Pure. */
export function parseBlogTarget(providerSettings: unknown): BlogPublishTarget | { error: string } {
  if (!isRecord(providerSettings)) return { error: "The website target's settings are missing." };
  const s = providerSettings;

  if (typeof s.repo !== "string" || !REPO.test(s.repo.trim())) {
    return { error: "The website target's repo must look like owner/name." };
  }
  const baseBranch = s.baseBranch === undefined || s.baseBranch === null || s.baseBranch === "" ? "main" : s.baseBranch;
  if (typeof baseBranch !== "string" || !BRANCH.test(baseBranch.trim()) || baseBranch.includes("..")) {
    return { error: "The website target's baseBranch is not a valid branch name." };
  }
  const contentPath = folder(s.contentPath, "src/content/blog", "contentPath");
  if (typeof contentPath !== "string") return contentPath;
  const imagePath = folder(s.imagePath, "public/images/blog", "imagePath");
  if (typeof imagePath !== "string") return imagePath;

  let liveBaseUrl = "";
  try {
    const url = new URL(typeof s.liveBaseUrl === "string" ? s.liveBaseUrl.trim() : "");
    if (url.protocol !== "https:") throw new Error("not https");
    liveBaseUrl = url.toString().replace(/\/+$/, "");
  } catch {
    return { error: "The website target's liveBaseUrl must be a full https address." };
  }

  if (s.defaultAuthor !== undefined && s.defaultAuthor !== null && typeof s.defaultAuthor !== "string") {
    return { error: "The website target's defaultAuthor must be text." };
  }
  const defaultAuthor = typeof s.defaultAuthor === "string" && s.defaultAuthor.trim() ? s.defaultAuthor.trim() : null;

  const rawClusters = s.ctaClusters === undefined || s.ctaClusters === null ? [] : s.ctaClusters;
  if (!Array.isArray(rawClusters)) return { error: "The website target's ctaClusters must be a list." };
  const ctaClusters: Array<{ code: string; label: string }> = [];
  for (const c of rawClusters) {
    if (!isRecord(c) || typeof c.code !== "string" || !SLUG.test(c.code)) {
      return { error: "Every code in the website target's ctaClusters must be lower case letters, numbers and hyphens." };
    }
    if (typeof c.label !== "string" || !c.label.trim()) {
      return { error: `The website target's ctaClusters entry "${c.code}" needs a label.` };
    }
    ctaClusters.push({ code: c.code, label: c.label.trim() });
  }

  return {
    provider: "github_pull_request", repo: s.repo.trim(), baseBranch: baseBranch.trim(), contentPath, imagePath,
    liveBaseUrl, defaultAuthor, ctaClusters, source: "company_config",
  };
}

// Only the one method the resolver needs from the Supabase client.
type Reader = { from: (table: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any

/**
 * The company's publish target and token, or a plain-word refusal. Always
 * filtered by company_id: another company's row is never read.
 */
export async function resolveBlogTarget(
  supabase: Reader, companyId: string,
): Promise<{ target: BlogPublishTarget; token: string | null } | { refusal: string }> {
  const { data: row, error } = await supabase.from("company_api_configs")
    .select("provider, provider_settings, credentials_encrypted")
    .eq("company_id", companyId)
    .eq("service_category", BLOG_PUBLISHING_CATEGORY)
    .eq("provider", BLOG_PUBLISHING_PROVIDER)
    .eq("is_active", true)
    .maybeSingle();
  if (error) return { refusal: "Could not read this company's website publishing target." };

  if (!row) {
    const only = process.env.WEBSITE_LEGACY_TARGET_COMPANY_ID;
    if (only && only !== companyId) return { refusal: NO_TARGET_REFUSAL };
    return { target: legacyBlogTarget(), token: process.env.WEBSITE_GITHUB_TOKEN || null };
  }

  const parsed = parseBlogTarget(row.provider_settings);
  if ("error" in parsed) return { refusal: parsed.error };

  let token: string | null = null;
  if (row.credentials_encrypted) {
    try {
      const t = decryptJson(row.credentials_encrypted as string).token;
      token = typeof t === "string" && t.trim() ? t.trim() : null;
    } catch {
      return { refusal: "This company's website publishing token could not be read. Set it up again." };
    }
  }
  return { target: parsed, token };
}
