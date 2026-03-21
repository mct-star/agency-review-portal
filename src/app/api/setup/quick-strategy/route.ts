import { NextResponse } from "next/server";
import { createServerSupabaseClient, getUserProfile } from "@/lib/supabase/server";

/**
 * POST /api/setup/quick-strategy
 *
 * Client-facing quick strategy setup. Enriches a company's setup from
 * LinkedIn URL + optional website URL. Updates the EXISTING company record
 * (unlike /api/setup/quick which creates a new company).
 *
 * Body: { companyId: string, linkedinUrl: string, websiteUrl?: string }
 */
export async function POST(request: Request) {
  const profile = await getUserProfile();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { companyId, linkedinUrl, websiteUrl } = body;

  if (!companyId || !linkedinUrl) {
    return NextResponse.json({ error: "companyId and linkedinUrl are required" }, { status: 400 });
  }

  // Access control: clients can only update their own company
  const isAdmin = profile.role === "admin";
  if (!isAdmin && profile.company_id !== companyId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const proxycurlKey = process.env.PROXYCURL_API_KEY;
  if (!proxycurlKey) {
    return NextResponse.json(
      { error: "LinkedIn enrichment is not configured. Please contact your administrator." },
      { status: 503 }
    );
  }

  const supabase = await createServerSupabaseClient();

  // Verify company exists
  const { data: company } = await supabase
    .from("companies")
    .select("id, name")
    .eq("id", companyId)
    .single();

  if (!company) return NextResponse.json({ error: "Company not found" }, { status: 404 });

  // ── 1. Enrich person from LinkedIn ───────────────────────────
  let url = linkedinUrl.trim();
  if (!url.startsWith("http")) url = `https://${url}`;

  let personName: string;
  let personTagline: string | null = null;
  let personPhoto: string | null = null;
  let companyLinkedinUrl: string | null = null;

  try {
    const res = await fetch(
      `https://nubela.co/proxycurl/api/v2/linkedin?url=${encodeURIComponent(url)}&use_cache=if-present`,
      { headers: { Authorization: `Bearer ${proxycurlKey}` } }
    );

    if (!res.ok) {
      if (res.status === 404) return NextResponse.json({ error: "LinkedIn profile not found" }, { status: 404 });
      if (res.status === 403) return NextResponse.json({ error: "LinkedIn profile is private" }, { status: 403 });
      return NextResponse.json({ error: `LinkedIn lookup failed (${res.status})` }, { status: 502 });
    }

    const data = await res.json();
    personName = data.full_name || `${data.first_name || ""} ${data.last_name || ""}`.trim() || "Unknown";
    personTagline = data.headline || null;
    personPhoto = data.profile_pic_url || null;

    const currentExp = (data.experiences || []).find((e: { ends_at: unknown }) => !e.ends_at);
    companyLinkedinUrl = currentExp?.company_linkedin_profile_url || null;
  } catch (err) {
    return NextResponse.json({ error: `LinkedIn lookup failed: ${err instanceof Error ? err.message : String(err)}` }, { status: 502 });
  }

  // ── 2. Extract company info ──────────────────────────────────
  let companyLogo: string | null = null;
  let brandColor: string | null = null;

  // Try company LinkedIn page
  if (companyLinkedinUrl) {
    try {
      const compRes = await fetch(
        `https://nubela.co/proxycurl/api/linkedin/company?url=${encodeURIComponent(companyLinkedinUrl)}&use_cache=if-present`,
        { headers: { Authorization: `Bearer ${proxycurlKey}` } }
      );
      if (compRes.ok) {
        const compData = await compRes.json();
        companyLogo = compData.profile_pic_url || null;
      }
    } catch {
      // Non-critical
    }
  }

  // Try website for brand colour and logo
  if (websiteUrl) {
    try {
      let siteUrl = websiteUrl.trim();
      if (!siteUrl.startsWith("http")) siteUrl = `https://${siteUrl}`;

      const siteRes = await fetch(siteUrl, {
        signal: AbortSignal.timeout(10_000),
        headers: { "User-Agent": "Mozilla/5.0 (compatible; ContentPlatform/1.0)" },
      });
      if (siteRes.ok) {
        const html = await siteRes.text();
        const themeMatch = html.match(/<meta[^>]*name=["']theme-color["'][^>]*content=["']([^"']+)["']/i);
        if (themeMatch) brandColor = themeMatch[1];

        if (!companyLogo) {
          const ogMatch = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i);
          if (ogMatch) {
            let logoUrl = ogMatch[1];
            if (logoUrl.startsWith("/")) logoUrl = new URL(logoUrl, siteUrl).href;
            companyLogo = logoUrl;
          }
        }
      }
    } catch {
      // Non-critical
    }
  }

  // ── 3. Update company record ───────────────────────────────
  const companyUpdates: Record<string, unknown> = {};
  if (companyLogo) companyUpdates.logo_url = companyLogo;
  if (brandColor) companyUpdates.brand_color = brandColor;
  if (personName) companyUpdates.spokesperson_name = personName;
  if (personTagline) companyUpdates.spokesperson_tagline = personTagline;
  if (personPhoto) companyUpdates.profile_picture_url = personPhoto;
  if (websiteUrl) companyUpdates.website_url = websiteUrl.trim();

  if (Object.keys(companyUpdates).length > 0) {
    await supabase.from("companies").update(companyUpdates).eq("id", companyId);
  }

  // ── 4. Create/update spokesperson ─────────────────────────
  const { data: existingPerson } = await supabase
    .from("company_spokespersons")
    .select("id")
    .eq("company_id", companyId)
    .eq("name", personName)
    .eq("is_active", true)
    .single();

  if (existingPerson) {
    await supabase
      .from("company_spokespersons")
      .update({
        tagline: personTagline,
        profile_picture_url: personPhoto,
        linkedin_url: linkedinUrl,
      })
      .eq("id", existingPerson.id);
  } else {
    // Set as primary
    await supabase
      .from("company_spokespersons")
      .update({ is_primary: false })
      .eq("company_id", companyId);

    await supabase.from("company_spokespersons").insert({
      company_id: companyId,
      name: personName,
      tagline: personTagline,
      profile_picture_url: personPhoto,
      linkedin_url: linkedinUrl,
      is_primary: true,
    });
  }

  return NextResponse.json({
    success: true,
    enrichedData: {
      personName,
      personTagline,
      personPhoto,
      companyLogo,
      brandColor,
    },
  });
}
