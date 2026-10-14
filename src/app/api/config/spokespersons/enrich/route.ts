import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/supabase/admin";

/**
 * POST /api/config/spokespersons/enrich
 *
 * Fetches LinkedIn profile data (name, headline, photo) for a given
 * LinkedIn URL using the Proxycurl API.
 *
 * Requires PROXYCURL_API_KEY environment variable.
 * Sign up at https://nubela.co/proxycurl — ~$0.01 per lookup.
 *
 * Body: { linkedinUrl: string }
 * Returns: { name, tagline, profilePictureUrl }
 */
export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { linkedinUrl } = await request.json();
  if (!linkedinUrl) {
    return NextResponse.json({ error: "linkedinUrl is required" }, { status: 400 });
  }

  const apiKey = process.env.PROXYCURL_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      {
        error: "LinkedIn import is not switched on yet. Ask AGENCY to connect the enrichment service.",
        setupRequired: true,
        message: "Ask AGENCY to connect the enrichment service.",
      },
      { status: 503 }
    );
  }

  // Normalise the URL — Proxycurl needs the canonical linkedin.com/in/... form
  let url = linkedinUrl.trim();
  if (!url.startsWith("http")) url = `https://${url}`;

  try {
    const res = await fetch(
      `https://nubela.co/proxycurl/api/v2/linkedin?url=${encodeURIComponent(url)}&use_cache=if-present`,
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      }
    );

    if (res.status === 404) {
      return NextResponse.json(
        { error: "LinkedIn profile not found. Make sure the URL is a public profile." },
        { status: 404 }
      );
    }

    if (res.status === 403) {
      return NextResponse.json(
        { error: "Profile is private or restricted." },
        { status: 403 }
      );
    }

    if (!res.ok) {
      console.error("[spokespersons/enrich] lookup failed:", res.status, (await res.text()).slice(0, 500));
      return NextResponse.json(
        { error: "We could not read that LinkedIn profile just now. Please try again." },
        { status: 502 }
      );
    }

    const data = await res.json();

    // Build a readable tagline from LinkedIn headline + current position
    const headline = data.headline || null;
    const firstName = data.first_name || "";
    const lastName = data.last_name || "";
    const fullName = data.full_name || `${firstName} ${lastName}`.trim();

    return NextResponse.json({
      name: fullName || null,
      tagline: headline || null,
      profilePictureUrl: data.profile_pic_url || null,
    });
  } catch (err) {
    console.error("[spokespersons/enrich] network error:", err);
    return NextResponse.json(
      { error: "We could not reach LinkedIn just now. Please try again." },
      { status: 502 }
    );
  }
}
