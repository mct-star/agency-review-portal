import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/supabase/admin";

/**
 * POST /api/config/company/enrich
 *
 * Scrapes a company website URL to extract:
 * - Company description (from meta description or OG tags)
 * - Logo/favicon URL
 * - Industry hints
 * - Tagline
 *
 * No external API needed — just fetches the HTML and parses meta tags.
 *
 * Body: { websiteUrl: string }
 * Returns: { description, logoUrl, tagline, industry, ogImage }
 */
export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { websiteUrl } = await request.json();
  if (!websiteUrl) {
    return NextResponse.json({ error: "websiteUrl is required" }, { status: 400 });
  }

  let url = websiteUrl.trim();
  if (!url.startsWith("http")) url = `https://${url}`;

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; ContentBot/1.0)",
        Accept: "text/html",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: `Could not fetch website (${res.status})` },
        { status: 502 }
      );
    }

    const html = await res.text();
    const baseUrl = new URL(url);

    // Parse meta tags from raw HTML (no DOM parser needed in edge)
    function getMeta(name: string): string | null {
      // Match both name="..." and property="..." variants
      const patterns = [
        new RegExp(`<meta[^>]+(?:name|property)=["']${name}["'][^>]+content=["']([^"']+)["']`, "i"),
        new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:name|property)=["']${name}["']`, "i"),
      ];
      for (const pat of patterns) {
        const match = html.match(pat);
        if (match) return match[1];
      }
      return null;
    }

    function getTitle(): string | null {
      const match = html.match(/<title[^>]*>([^<]+)<\/title>/i);
      return match ? match[1].trim() : null;
    }

    // Extract structured data
    const description =
      getMeta("og:description") ||
      getMeta("description") ||
      getMeta("twitter:description") ||
      null;

    const tagline =
      getMeta("og:title") ||
      getTitle() ||
      null;

    const ogImage = getMeta("og:image") || null;

    // Try to find a logo
    // Priority: apple-touch-icon > og:image > favicon
    let logoUrl: string | null = null;

    // Apple touch icon (usually high-res logo)
    const appleTouchMatch = html.match(
      /<link[^>]+rel=["']apple-touch-icon["'][^>]+href=["']([^"']+)["']/i
    );
    if (appleTouchMatch) {
      logoUrl = appleTouchMatch[1];
    }

    // Standard favicon
    if (!logoUrl) {
      const faviconMatch = html.match(
        /<link[^>]+rel=["'](?:shortcut )?icon["'][^>]+href=["']([^"']+)["']/i
      );
      if (faviconMatch) {
        logoUrl = faviconMatch[1];
      }
    }

    // Resolve relative URLs
    if (logoUrl && !logoUrl.startsWith("http")) {
      logoUrl = new URL(logoUrl, baseUrl.origin).href;
    }
    let resolvedOgImage = ogImage;
    if (resolvedOgImage && !resolvedOgImage.startsWith("http")) {
      resolvedOgImage = new URL(resolvedOgImage, baseUrl.origin).href;
    }

    // If no logo found, try /favicon.ico as fallback
    if (!logoUrl) {
      logoUrl = `${baseUrl.origin}/favicon.ico`;
    }

    return NextResponse.json({
      description: description || null,
      tagline: tagline || null,
      logoUrl: logoUrl || null,
      ogImage: resolvedOgImage || null,
      domain: baseUrl.hostname,
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: `Failed to fetch website: ${err instanceof Error ? err.message : String(err)}`,
      },
      { status: 502 }
    );
  }
}
