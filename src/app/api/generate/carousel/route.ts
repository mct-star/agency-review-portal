import { NextResponse } from "next/server";
import { requireCompanyUser, createAdminSupabaseClient } from "@/lib/supabase/admin";
import { generateCarousel, type CarouselSlide } from "@/lib/image/carousel";

/**
 * POST /api/generate/carousel
 *
 * Generate a carousel set of slides programmatically.
 * Returns an array of image URLs (uploaded to Supabase Storage).
 *
 * Body: {
 *   companyId: string,
 *   spokespersonId?: string,
 *   title: string,                    // Cover slide title
 *   subtitle?: string,                // Cover slide subtitle
 *   slides: { title: string, body?: string }[],  // Content slides
 *   ctaText?: string,                 // CTA slide text (default: "Want to learn more?")
 *   accentColor?: string,             // Hex colour (default: company brand colour)
 * }
 */
export async function POST(request: Request) {
  const body = await request.json();
  const { companyId, spokespersonId, title, subtitle, slides, ctaText, accentColor } = body;

  if (!companyId || !title || !slides || !Array.isArray(slides) || slides.length === 0) {
    return NextResponse.json(
      { error: "companyId, title, and slides[] are required" },
      { status: 400 }
    );
  }

  const profile = await requireCompanyUser(companyId);
  if (!profile) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = await createAdminSupabaseClient();

  // Fetch company branding
  const { data: company } = await supabase
    .from("companies")
    .select("name, brand_color, overlay_logo_url, logo_url")
    .eq("id", companyId)
    .single();

  // Fetch spokesperson
  let profilePicUrl: string | null = null;
  let profileName: string | null = null;

  if (spokespersonId) {
    const { data: person } = await supabase
      .from("company_spokespersons")
      .select("name, photo_url, profile_picture_url")
      .eq("id", spokespersonId)
      .eq("company_id", companyId)
      .single();
    if (person) {
      profilePicUrl = person.photo_url || person.profile_picture_url || null;
      profileName = person.name;
    }
  }
  if (!profileName) {
    const { data: primaryPerson } = await supabase
      .from("company_spokespersons")
      .select("name, photo_url, profile_picture_url")
      .eq("company_id", companyId)
      .eq("is_primary", true)
      .limit(1)
      .single();
    if (primaryPerson) {
      profilePicUrl = profilePicUrl || primaryPerson.photo_url || primaryPerson.profile_picture_url || null;
      profileName = profileName || primaryPerson.name;
    }
  }

  const resolvedAccent = accentColor || company?.brand_color || "#A27BF9";
  const totalContentSlides = slides.length;

  // Build slide config
  const carouselSlides: CarouselSlide[] = [
    // Cover slide
    {
      type: "cover",
      title,
      body: subtitle || undefined,
    },
    // Content slides
    ...slides.map((s: { title: string; body?: string }, i: number) => ({
      type: "content" as const,
      slideNumber: i + 1,
      totalSlides: totalContentSlides,
      title: s.title,
      body: s.body || undefined,
    })),
    // CTA slide
    {
      type: "cta",
      title: ctaText || "Want to learn more?",
      body: profileName ? `Follow ${profileName} for more insights like this.` : undefined,
    },
  ];

  try {
    const result = await generateCarousel({
      slides: carouselSlides,
      accentColor: resolvedAccent,
      profilePicUrl,
      profileName,
      logoUrl: company?.overlay_logo_url || company?.logo_url || null,
      companyName: company?.name || null,
    });

    // Upload all slides to Supabase Storage
    const timestamp = Date.now();
    const uploadedUrls: string[] = [];

    for (const slide of result.slides) {
      const filename = `carousel-${timestamp}-slide-${slide.slideIndex}.png`;
      const storagePath = `images/${companyId}/carousel/${filename}`;

      await supabase.storage.from("content-assets").upload(storagePath, slide.buffer, {
        contentType: "image/png",
        upsert: true,
      });

      const { data: urlData } = supabase.storage
        .from("content-assets")
        .getPublicUrl(storagePath);
      uploadedUrls.push(urlData.publicUrl);
    }

    return NextResponse.json({
      imageUrls: uploadedUrls,
      count: result.count,
      width: result.width,
      height: result.height,
    });
  } catch (err) {
    console.error("[carousel] Generation failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Carousel generation failed" },
      { status: 500 }
    );
  }
}
