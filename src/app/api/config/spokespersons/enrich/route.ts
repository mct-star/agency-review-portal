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
        error: "PROXYCURL_API_KEY not configured",
        setupRequired: true,
        message:
          "Add PROXYCURL_API_KEY to your environment variables. " +
          "Sign up at https://nubela.co/proxycurl — approximately $0.01 per lookup.",
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
      const text = await res.text();
      return NextResponse.json(
        { error: `Proxycurl error (${res.status}): ${text}` },
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
    return NextResponse.json(
      { error: `Network error reaching Proxycurl: ${err instanceof Error ? err.message : String(err)}` },
      { status: 502 }
    );
  }
}
