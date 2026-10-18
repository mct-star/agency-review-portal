import { NextResponse } from "next/server";
import { requireAdmin, requireCompanyUser, createAdminSupabaseClient } from "@/lib/supabase/admin";

/**
 * GET /api/publish/jobs?companyId=uuid&status=queued&limit=50
 * List publishing jobs, optionally filtered by company and status.
 *
 * POST /api/publish/jobs
 * Create a new publishing job (queue content for publishing).
 * Body: {
 *   companyId: string,
 *   contentPieceId: string,
 *   platformVariantId?: string,
 *   targetPlatform: string,
 *   scheduledFor?: string (ISO datetime),
 * }
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const companyId = searchParams.get("companyId");
  const status = searchParams.get("status");
  const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 200);

  const admin = await requireAdmin();
  const profile = admin || (companyId ? await requireCompanyUser(companyId) : null);
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (profile.role !== "admin" && (!companyId || !profile.can_publish)) {
    return NextResponse.json({ error: "Your account cannot publish." }, { status: 403 });
  }
  if (!admin && profile.company_id !== companyId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!admin && !companyId) return NextResponse.json({ error: "companyId is required" }, { status: 400 });

  const supabase = await createAdminSupabaseClient();

  let query = supabase
    .from("publishing_jobs")
    .select("*, company:companies(name), content_piece:content_pieces(title, content_type), social_account:company_social_accounts(account_name)")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (companyId) query = query.eq("company_id", companyId);
  if (status) query = query.eq("status", status);

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (admin) return NextResponse.json({ data: data || [] });
  const safeData = (data || []).map((job) => ({
    id: job.id,
    company_id: job.company_id,
    content_piece_id: job.content_piece_id,
    target_platform: job.target_platform,
    status: job.status,
    scheduled_for: job.scheduled_for,
    published_at: job.published_at,
    external_url: job.external_url,
    error_message: job.error_message,
    created_at: job.created_at,
    social_account_id: job.social_account_id,
    needs_checking: !!(job.response_payload as { outcome_uncertain?: boolean } | null)?.outcome_uncertain,
    content_piece: job.content_piece,
    social_account: job.social_account,
  }));
  return NextResponse.json({ data: safeData });
}

export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const {
    companyId,
    contentPieceId,
    platformVariantId,
    targetPlatform,
    scheduledFor,
  } = body;

  if (!companyId || !contentPieceId || !targetPlatform) {
    return NextResponse.json(
      { error: "companyId, contentPieceId, and targetPlatform are required" },
      { status: 400 }
    );
  }

  const supabase = await createAdminSupabaseClient();

  // Look up the API config for the publishing platform
  // (social_scheduling or blog_publishing depending on target)
  const isBlog = ["wordpress", "wix", "shopify"].includes(targetPlatform);
  const serviceCategory = isBlog ? "blog_publishing" : "social_scheduling";

  const { data: apiConfig } = await supabase
    .from("company_api_configs")
    .select("id")
    .eq("company_id", companyId)
    .eq("service_category", serviceCategory)
    .eq("is_active", true)
    .single();

  // Look up social account if applicable
  let socialAccountId = null;
  if (!isBlog && platformVariantId) {
    const { data: variant } = await supabase
      .from("platform_variants")
      .select("social_account_id")
      .eq("id", platformVariantId)
      .single();
    socialAccountId = variant?.social_account_id || null;
  }

  const { data: job, error } = await supabase
    .from("publishing_jobs")
    .insert({
      company_id: companyId,
      content_piece_id: contentPieceId,
      platform_variant_id: platformVariantId || null,
      target_platform: targetPlatform,
      api_config_id: apiConfig?.id || null,
      social_account_id: socialAccountId,
      status: scheduledFor ? "scheduled" : "queued",
      scheduled_for: scheduledFor || null,
      triggered_by: admin.id,
    })
    .select()
    .single();

  if (error || !job) {
    return NextResponse.json(
      { error: error?.message || "Failed to create publishing job" },
      { status: 500 }
    );
  }

  return NextResponse.json({ data: job });
}
