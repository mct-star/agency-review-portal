import { NextResponse } from "next/server";
import { requireCompanyUser, createAdminSupabaseClient } from "@/lib/supabase/admin";
import { resolvePieceMedia } from "@/lib/content/piece-media";
import { directMetaJobId, isMetaPublicMediaUrl } from "@/lib/meta/direct-publish";
import { toMetaCaption } from "@/lib/meta/direct-publish";
import { metaConfig } from "@/lib/meta/oauth";

/** Queues approved Facebook or Instagram content for the exact connected account selected by a company publisher. */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { companyId?: string; pieceId?: string; socialAccountId?: string; platform?: string; scheduledFor?: string | null } | null;
  if (!body?.companyId) return NextResponse.json({ error: "companyId is required" }, { status: 400 });
  const user = await requireCompanyUser(body.companyId);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "admin" && !user.can_publish) return NextResponse.json({ error: "Your account cannot publish." }, { status: 403 });
  if (!body.pieceId || !body.socialAccountId || !["facebook", "instagram"].includes(body.platform || "")) return NextResponse.json({ error: "Choose an approved post, platform and connected account." }, { status: 400 });
  const platform = body.platform as "facebook" | "instagram";
  const scheduledFor = body.scheduledFor || null;
  if (scheduledFor && (!Number.isFinite(Date.parse(scheduledFor)) || Date.parse(scheduledFor) <= Date.now())) return NextResponse.json({ error: "Choose a future date and time." }, { status: 400 });
  const supabase = await createAdminSupabaseClient();
  const [{ data: piece }, { data: account }, { data: company }] = await Promise.all([
    supabase.from("content_pieces").select("id, company_id, approval_status, content_type, markdown_body, first_comment, title, cover_image_url").eq("id", body.pieceId).eq("company_id", body.companyId).maybeSingle(),
    supabase.from("company_social_accounts").select("id, company_id, account_id, account_name, access_token_encrypted, token_expires_at, platform_metadata").eq("id", body.socialAccountId).eq("company_id", body.companyId).eq("platform", platform).eq("is_active", true).maybeSingle(),
    supabase.from("companies").select("social_networks").eq("id", body.companyId).maybeSingle(),
  ]);
  if (!piece || piece.approval_status !== "approved") return NextResponse.json({ error: "Choose approved content from this company." }, { status: 400 });
  if (piece.content_type !== "social_post") return NextResponse.json({ error: "Only approved social posts can be published." }, { status: 422 });
  const expiry = account?.token_expires_at ? Date.parse(account.token_expires_at) : null;
  if (!account?.account_id || !account.access_token_encrypted || (expiry !== null && (!Number.isFinite(expiry) || expiry <= Date.now()))) return NextResponse.json({ error: "Choose an active Meta account. This connection may need reconnecting." }, { status: 404 });
  const networks = (company?.social_networks || []) as string[];
  if (!networks.includes(platform)) return NextResponse.json({ error: `Publishing to ${platform} is not enabled for this company.` }, { status: 403 });
  const [{ data: images }, { data: assets }] = await Promise.all([
    supabase.from("content_images").select("public_url, filename, sort_order, dimensions").eq("content_piece_id", piece.id),
    supabase.from("content_assets").select("asset_type, file_url, text_content, asset_metadata").eq("content_piece_id", piece.id).not("file_url", "is", null),
  ]);
  const media = resolvePieceMedia(piece, images || [], assets || []);
  if (["video", "document", "images"].includes(media.shape)) return NextResponse.json({ error: "This pilot supports text or one photo only. Video, documents and carousels are not supported." }, { status: 422 });
  const imageUrl = media.items.find((item) => item.kind === "image")?.url || null;
  if (imageUrl && !isMetaPublicMediaUrl(imageUrl)) return NextResponse.json({ error: "The post photo must use this portal's public storage." }, { status: 400 });
  if (platform === "instagram" && !imageUrl) return NextResponse.json({ error: "Instagram publishing requires one JPEG photo." }, { status: 422 });
  const caption = toMetaCaption(piece.markdown_body || "");
  if (!caption) return NextResponse.json({ error: "The post has no publishable text." }, { status: 400 });
  if (platform === "instagram" && caption.length > 2200) return NextResponse.json({ error: "Instagram captions must be 2,200 characters or fewer." }, { status: 422 });
  const jobId = directMetaJobId(body.companyId, piece.id, account.id, platform);
  const { data: job, error } = await supabase.from("publishing_jobs").insert({
    id: jobId, company_id: body.companyId, content_piece_id: piece.id, social_account_id: account.id,
    target_platform: platform, status: scheduledFor ? "scheduled" : "queued", scheduled_for: scheduledFor,
    triggered_by: user.id, publish_payload: { provider: "meta-direct-v1", platform, caption, image_url: imageUrl },
  }).select("id,status,scheduled_for,social_account_id").maybeSingle();
  if (error?.code === "23505") return NextResponse.json({ error: "This post has already been queued for the selected account. Check its status before taking further action." }, { status: 409 });
  if (error || !job) return NextResponse.json({ error: "Could not queue this Meta post." }, { status: 500 });
  return NextResponse.json({ data: job }, { status: 201 });
}

/** Lists only safe active Meta account metadata and supports withdrawal by deactivating this company's selected account. */
export async function GET(request: Request) {
  const companyId = new URL(request.url).searchParams.get("companyId");
  if (!companyId) return NextResponse.json({ error: "companyId is required" }, { status: 400 });
  const user = await requireCompanyUser(companyId);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "admin" && !user.can_publish) return NextResponse.json({ error: "Your account cannot publish." }, { status: 403 });
  const supabase = await createAdminSupabaseClient();
  const [{ data, error }, { data: company, error: companyError }] = await Promise.all([
    supabase.from("company_social_accounts").select("id, platform, account_name, account_id, access_token_encrypted, token_expires_at, is_active, platform_metadata")
      .eq("company_id", companyId).in("platform", ["facebook", "instagram"]).eq("is_active", true),
    supabase.from("companies").select("social_networks").eq("id", companyId).maybeSingle(),
  ]);
  if (error) return NextResponse.json({ error: "Could not load Meta accounts." }, { status: 500, headers: { "Cache-Control": "no-store, max-age=0" } });
  if (companyError || !company) return NextResponse.json({ error: "Could not load enabled publishing destinations." }, { status: 500 });
  return NextResponse.json({ configured: !!metaConfig(), enabledNetworks: company.social_networks || [], accounts: (data || []).map((row) => { const expiry = row.token_expires_at ? Date.parse(row.token_expires_at) : null; return { id: row.id, platform: row.platform, accountName: row.account_name || row.platform, accountId: row.account_id, usable: !!row.account_id && !!row.access_token_encrypted && (expiry === null || (Number.isFinite(expiry) && expiry > Date.now())), pageId: (row.platform_metadata as { page_id?: string } | null)?.page_id || null }; }) }, { headers: { "Cache-Control": "no-store, max-age=0" } });
}

export async function DELETE(request: Request) {
  const body = await request.json().catch(() => null) as { companyId?: string; socialAccountId?: string } | null;
  if (!body?.companyId || !body.socialAccountId) return NextResponse.json({ error: "companyId and socialAccountId are required" }, { status: 400 });
  const user = await requireCompanyUser(body.companyId);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "admin" && !user.can_publish) return NextResponse.json({ error: "Your account cannot manage publishing." }, { status: 403 });
  const supabase = await createAdminSupabaseClient();
  const { data: account } = await supabase.from("company_social_accounts").select("id,company_id,platform,platform_metadata").eq("id", body.socialAccountId).eq("company_id", body.companyId).in("platform", ["facebook", "instagram"]).maybeSingle();
  if (!account) return NextResponse.json({ error: "Meta account not found." }, { status: 404 });
  const pageId = (account.platform_metadata as { page_id?: string } | null)?.page_id;
  const related = pageId ? await supabase.from("company_social_accounts").select("id").eq("company_id", body.companyId).in("platform", ["facebook", "instagram"]).eq("platform_metadata->>page_id", pageId) : { data: [] as Array<{ id: string }> };
  const ids = [...new Set([account.id, ...(related.data || []).map((row) => row.id)])];
  const { error } = await supabase.from("company_social_accounts").update({ is_active: false, access_token_encrypted: null, refresh_token_encrypted: null }).eq("company_id", body.companyId).in("id", ids);
  if (error) return NextResponse.json({ error: "Could not disconnect the Meta account." }, { status: 500 });
  return NextResponse.json({ disconnected: true, message: "The Facebook Page and its linked Instagram account have been disconnected." });
}
