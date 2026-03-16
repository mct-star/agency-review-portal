import { NextResponse } from "next/server";
import { requireAdmin, createAdminSupabaseClient } from "@/lib/supabase/admin";
import { resolveProvider } from "@/lib/providers";
import type { PublishingProvider } from "@/lib/providers/publishing/types";
import type { DistributionPlatform } from "@/types/database";

/**
 * POST /api/publish/syndicate
 * Syndicate a blog article to a content platform (Substack, Medium).
 *
 * Body: {
 *   contentPieceId: string,
 *   targetPlatform: "substack" | "medium",
 *   canonicalUrl?: string,        // If not provided, uses existing canonical
 *   sendNewsletter?: boolean,     // Substack only: send as email
 *   platformVariantId?: string,   // Use adapted content from this variant
 * }
 */
export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const {
    contentPieceId,
    targetPlatform,
    canonicalUrl,
    sendNewsletter,
    platformVariantId,
  } = body;

  if (!contentPieceId || !targetPlatform) {
    return NextResponse.json(
      { error: "contentPieceId and targetPlatform are required" },
      { status: 400 }
    );
  }

  if (!["substack", "medium"].includes(targetPlatform)) {
    return NextResponse.json(
      { error: "targetPlatform must be 'substack' or 'medium'" },
      { status: 400 }
    );
  }

  const supabase = await createAdminSupabaseClient();

  // Fetch the content piece
  const { data: piece } = await supabase
    .from("content_pieces")
    .select("*")
    .eq("id", contentPieceId)
    .single();

  if (!piece) {
    return NextResponse.json({ error: "Content piece not found" }, { status: 404 });
  }

  // Check for existing canonical URL
  const { data: existingCanonical } = await supabase
    .from("content_syndication_links")
    .select("external_url")
    .eq("content_piece_id", contentPieceId)
    .eq("is_canonical", true)
    .single();

  const effectiveCanonical = canonicalUrl || existingCanonical?.external_url;

  // If syndicating and no canonical exists, warn
  if (!effectiveCanonical && !canonicalUrl) {
    return NextResponse.json(
      {
        error:
          "No canonical URL found. Publish to your website first, or provide a canonicalUrl in the request.",
      },
      { status: 400 }
    );
  }

  // Get content to syndicate — prefer adapted variant if provided
  let syndicatedContent = piece.markdown_body;
  let syndicatedTitle = piece.title;

  if (platformVariantId) {
    const { data: variant } = await supabase
      .from("platform_variants")
      .select("adapted_copy, platform_metadata")
      .eq("id", platformVariantId)
      .single();

    if (variant) {
      syndicatedContent = variant.adapted_copy;
      const metadata = variant.platform_metadata as Record<string, unknown>;
      if (typeof metadata?.subtitle === "string") {
        // Use metadata from adaptation
      }
    }
  }

  // Resolve the publishing provider
  const serviceCategory =
    targetPlatform === "substack" ? "newsletter_publishing" : "content_syndication";

  const resolved = await resolveProvider(piece.company_id, serviceCategory);
  if (!resolved) {
    return NextResponse.json(
      {
        error: `No ${serviceCategory} provider configured for this company. Add one in Company Settings → API Providers.`,
      },
      { status: 400 }
    );
  }

  // Create the provider
  let provider: PublishingProvider;
  if (targetPlatform === "substack") {
    const { createSubstackPublishingProvider } = await import(
      "@/lib/providers/publishing/substack"
    );
    provider = createSubstackPublishingProvider(
      resolved.credentials,
      resolved.settings
    );
  } else {
    const { createMediumPublishingProvider } = await import(
      "@/lib/providers/publishing/medium"
    );
    provider = createMediumPublishingProvider(
      resolved.credentials,
      resolved.settings
    );
  }

  try {
    // Publish
    const result = await provider.publish({
      title: syndicatedTitle,
      content: syndicatedContent,
      canonicalUrl: effectiveCanonical || undefined,
      sendNewsletter: targetPlatform === "substack" ? sendNewsletter : undefined,
    });

    // Record in syndication links
    await supabase.from("content_syndication_links").insert({
      content_piece_id: contentPieceId,
      platform: targetPlatform as DistributionPlatform,
      external_url: result.externalUrl,
      is_canonical: false, // Never canonical — canonical is the main website
      published_at: new Date().toISOString(),
    });

    // Also create a publishing job record for audit trail
    await supabase.from("publishing_jobs").insert({
      company_id: piece.company_id,
      content_piece_id: contentPieceId,
      platform_variant_id: platformVariantId || null,
      target_platform: targetPlatform,
      status: result.status === "published" ? "published" : "scheduled",
      external_id: result.externalId,
      external_url: result.externalUrl,
      canonical_url: effectiveCanonical,
      published_at:
        result.status === "published" ? new Date().toISOString() : null,
      triggered_by: admin.id,
    });

    return NextResponse.json({
      status: result.status,
      externalUrl: result.externalUrl,
      externalId: result.externalId,
      canonicalUrl: effectiveCanonical,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: `Syndication failed: ${message}` },
      { status: 500 }
    );
  }
}
