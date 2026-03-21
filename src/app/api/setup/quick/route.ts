import { NextResponse } from "next/server";
import { requireAdmin, createAdminSupabaseClient } from "@/lib/supabase/admin";

/**
 * POST /api/setup/quick
 *
 * Quick Setup — create a company from a LinkedIn URL + website URL.
 * Enriches the person from LinkedIn (name, tagline, photo) via Proxycurl,
 * and extracts company info (name, logo, brand colour) from the website.
 *
 * Body: { linkedinUrl: string, websiteUrl?: string }
 *
 * Flow:
 * 1. Enrich person from LinkedIn via Proxycurl
 * 2. Extract company info from LinkedIn profile (employer) or website
 * 3. Create company record
 * 4. Create spokesperson record (primary)
 * 5. Return both records
 */
export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { linkedinUrl, websiteUrl } = body;

  if (!linkedinUrl) {
    return NextResponse.json({ error: "linkedinUrl is required" }, { status: 400 });
  }

  const proxycurlKey = process.env.PROXYCURL_API_KEY;
  if (!proxycurlKey) {
    return NextResponse.json(
      {
        error: "PROXYCURL_API_KEY not configured",
        setupRequired: true,
        message: "Add PROXYCURL_API_KEY to your environment. Sign up at https://nubela.co/proxycurl (~$0.01/lookup).",
      },
      { status: 503 }
    );
  }

  const supabase = await createAdminSupabaseClient();

  // ── 1. Enrich person from LinkedIn ───────────────────────────
  let url = linkedinUrl.trim();
  if (!url.startsWith("http")) url = `https://${url}`;

  let personData: {
    name: string;
    tagline: string | null;
    profilePictureUrl: string | null;
    companyName: string | null;
    companyLinkedinUrl: string | null;
  };

  try {
    const res = await fetch(
      `https://nubela.co/proxycurl/api/v2/linkedin?url=${encodeURIComponent(url)}&use_cache=if-present`,
      { headers: { Authorization: `Bearer ${proxycurlKey}` } }
    );

    if (!res.ok) {
      const status = res.status;
      if (status === 404) return NextResponse.json({ error: "LinkedIn profile not found" }, { status: 404 });
      if (status === 403) return NextResponse.json({ error: "LinkedIn profile is private" }, { status: 403 });
      const text = await res.text();
      return NextResponse.json({ error: `Proxycurl error (${status}): ${text}` }, { status: 502 });
    }

    const data = await res.json();
    const firstName = data.first_name || "";
    const lastName = data.last_name || "";

    // Extract current employer
    const currentExperience = (data.experiences || []).find(
      (e: { ends_at: unknown }) => !e.ends_at
    );

    personData = {
      name: data.full_name || `${firstName} ${lastName}`.trim() || "Unknown",
      tagline: data.headline || null,
      profilePictureUrl: data.profile_pic_url || null,
      companyName: currentExperience?.company || data.company || null,
      companyLinkedinUrl: currentExperience?.company_linkedin_profile_url || null,
    };
  } catch (err) {
    return NextResponse.json(
      { error: `Failed to reach LinkedIn enrichment: ${err instanceof Error ? err.message : String(err)}` },
      { status: 502 }
    );
  }

  // ── 2. Resolve company info ──────────────────────────────────
  let companyName = personData.companyName || "My Company";
  let companyLogo: string | null = null;
  let brandColor: string | null = null;
  let companyDescription: string | null = null;

  // Try Proxycurl company lookup if we have a company LinkedIn URL
  if (personData.companyLinkedinUrl) {
    try {
      const compRes = await fetch(
        `https://nubela.co/proxycurl/api/linkedin/company?url=${encodeURIComponent(personData.companyLinkedinUrl)}&use_cache=if-present`,
        { headers: { Authorization: `Bearer ${proxycurlKey}` } }
      );
      if (compRes.ok) {
        const compData = await compRes.json();
        companyName = compData.name || companyName;
        companyLogo = compData.profile_pic_url || null;
        companyDescription = compData.description || compData.tagline || null;
      }
    } catch {
      // Non-critical — continue with person-sourced company name
    }
  }

  // Try to extract brand colour from website if provided
  if (websiteUrl) {
    try {
      let siteUrl = websiteUrl.trim();
      if (!siteUrl.startsWith("http")) siteUrl = `https://${siteUrl}`;

      // Fetch the website HTML and look for theme-color meta tag
      const siteRes = await fetch(siteUrl, {
        signal: AbortSignal.timeout(10_000),
        headers: { "User-Agent": "Mozilla/5.0 (compatible; ContentPlatform/1.0)" },
      });
      if (siteRes.ok) {
        const html = await siteRes.text();

        // Extract theme-color meta tag
        const themeColorMatch = html.match(
          /<meta[^>]*name=["']theme-color["'][^>]*content=["']([^"']+)["']/i
        );
        if (themeColorMatch) {
          brandColor = themeColorMatch[1];
        }

        // Try favicon/logo from various common patterns
        if (!companyLogo) {
          // og:image
          const ogMatch = html.match(
            /<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i
          );
          if (ogMatch) {
            let logoUrl = ogMatch[1];
            if (logoUrl.startsWith("/")) logoUrl = new URL(logoUrl, siteUrl).href;
            companyLogo = logoUrl;
          }
        }
      }
    } catch {
      // Non-critical — continue without website data
    }
  }

  // ── 3. Create company ────────────────────────────────────────
  const slug = companyName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

  // Check if company with this slug already exists
  const { data: existingCompany } = await supabase
    .from("companies")
    .select("id, name")
    .eq("slug", slug)
    .single();

  let companyId: string;
  let companyCreated = false;

  if (existingCompany) {
    // Company already exists — use it
    companyId = existingCompany.id;
    companyName = existingCompany.name;
  } else {
    const { data: newCompany, error: compErr } = await supabase
      .from("companies")
      .insert({
        name: companyName,
        slug,
        spokesperson_name: personData.name,
        spokesperson_tagline: personData.tagline,
        brand_color: brandColor,
        logo_url: companyLogo,
        profile_picture_url: personData.profilePictureUrl,
        content_strategy_mode: "cohesive",
      })
      .select()
      .single();

    if (compErr) {
      return NextResponse.json({ error: `Failed to create company: ${compErr.message}` }, { status: 500 });
    }
    companyId = newCompany.id;
    companyCreated = true;
  }

  // ── 4. Create spokesperson ───────────────────────────────────
  // Check if this person already exists for this company
  const { data: existingPerson } = await supabase
    .from("company_spokespersons")
    .select("id")
    .eq("company_id", companyId)
    .eq("name", personData.name)
    .eq("is_active", true)
    .single();

  let spokespersonId: string;
  let personCreated = false;

  if (existingPerson) {
    spokespersonId = existingPerson.id;
    // Update with enriched data
    await supabase
      .from("company_spokespersons")
      .update({
        tagline: personData.tagline,
        profile_picture_url: personData.profilePictureUrl,
        linkedin_url: linkedinUrl,
      })
      .eq("id", spokespersonId);
  } else {
    // Unset other primaries
    await supabase
      .from("company_spokespersons")
      .update({ is_primary: false })
      .eq("company_id", companyId);

    const { data: newPerson, error: personErr } = await supabase
      .from("company_spokespersons")
      .insert({
        company_id: companyId,
        name: personData.name,
        tagline: personData.tagline,
        profile_picture_url: personData.profilePictureUrl,
        linkedin_url: linkedinUrl,
        is_primary: true,
      })
      .select()
      .single();

    if (personErr) {
      return NextResponse.json({ error: `Failed to create spokesperson: ${personErr.message}` }, { status: 500 });
    }
    spokespersonId = newPerson.id;
    personCreated = true;
  }

  return NextResponse.json({
    companyId,
    companyName,
    companyCreated,
    spokespersonId,
    personCreated,
    enrichedData: {
      personName: personData.name,
      personTagline: personData.tagline,
      personPhoto: personData.profilePictureUrl,
      companyLogo,
      brandColor,
      companyDescription,
      websiteUrl: websiteUrl || null,
    },
  });
}
