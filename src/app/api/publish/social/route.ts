import { NextResponse } from "next/server";
import { requireCompanyUser, createAdminSupabaseClient } from "@/lib/supabase/admin";
import { resolvePieceMedia } from "@/lib/content/piece-media";
import { decrypt } from "@/lib/crypto";
import {
  directSocialJobId,
  directSocialNetwork,
  isDirectSocialPlatform,
  isDirectSocialPublicMediaUrl,
  toDirectSocialText,
  validateDirectSocialOptions,
  type DirectSocialMedia,
  type DirectSocialPlatform,
} from "@/lib/publishing/direct-social";
import { directSocialConfigured, getDirectSocialAdapter } from "@/lib/publishing/adapter-registry";
import { BLUESKY_SESSION_MARKER } from "@/lib/bluesky/oauth";
import { refuseHospitality } from "@/lib/hospitality/pack-guard";

const NO_CACHE = { "Cache-Control": "no-store, max-age=0" };

/** Lists safe direct-social connections and approved content, queues an approved post, or disconnects one selected account. */
export async function GET(request: Request) {
  const companyId = new URL(request.url).searchParams.get("companyId");
  if (!companyId) return NextResponse.json({ error: "companyId is required" }, { status: 400, headers: NO_CACHE });
  const user = await requireCompanyUser(companyId);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: NO_CACHE });
  if (user.role !== "admin" && !user.can_publish) return NextResponse.json({ error: "Your account cannot publish." }, { status: 403, headers: NO_CACHE });

  const supabase = await createAdminSupabaseClient();
  const [{ data: company }, { data: rows, error: accountsError }, { data: approved, error: piecesError }] = await Promise.all([
    supabase.from("companies").select("social_networks").eq("id", companyId).maybeSingle(),
    supabase.from("company_social_accounts").select("id,platform,account_id,account_name,access_token_encrypted,refresh_token_encrypted,token_expires_at,is_active,platform_metadata")
      .eq("company_id", companyId).in("platform", ["bluesky", "threads", "twitter", "pinterest", "youtube"]).eq("is_active", true),
    supabase.from("content_pieces").select("id,title,content_type,markdown_body,cover_image_url")
      .eq("company_id", companyId).eq("approval_status", "approved").order("created_at", { ascending: false }).limit(100),
  ]);
  if (accountsError || piecesError || !company) return NextResponse.json({ error: "Could not load publishing options." }, { status: 500, headers: NO_CACHE });

  const configured = Object.fromEntries(([
    "bluesky", "threads", "twitter", "pinterest", "youtube",
  ] as DirectSocialPlatform[]).map((platform) => [platform, directSocialConfigured(platform)])) as Record<DirectSocialPlatform, boolean>;
  const enabledNetworks = Array.isArray(company.social_networks) ? company.social_networks : [];
  const accounts = (rows || []).filter((row) => isDirectSocialPlatform(row.platform)).map((row) => {
    let hasCredential = false;
    let refreshable = false;
    try {
      const credential = row.access_token_encrypted ? decrypt(row.access_token_encrypted) : "";
      hasCredential = !!credential;
      refreshable = !!row.refresh_token_encrypted;
      if (row.platform === "bluesky" && credential) refreshable ||= JSON.parse(credential)?.marker === BLUESKY_SESSION_MARKER;
    } catch { hasCredential = false; refreshable = false; }
    const expiry = row.token_expires_at ? Date.parse(row.token_expires_at) : null;
    const metadata = (row.platform_metadata || {}) as Record<string, unknown>;
    const safeMetadata: Record<string, string> = {};
    for (const key of ["handle", "username", "board_name", "board_id", "channel_name", "auth_method"]) {
      if (typeof metadata[key] === "string") safeMetadata[key] = metadata[key] as string;
    }
    return {
      id: row.id,
      platform: row.platform as DirectSocialPlatform,
      accountId: row.account_id,
      accountName: row.account_name || row.platform,
      usable: hasCredential && !!row.account_id && (expiry === null || (Number.isFinite(expiry) && (expiry > Date.now() || (refreshable && row.platform !== "threads")))),
      metadata: safeMetadata,
    };
  });

  const pieceIds = (approved || []).map((piece) => piece.id);
  const [{ data: imageRows }, { data: assetRows }] = pieceIds.length ? await Promise.all([
    supabase.from("content_images").select("content_piece_id,public_url,filename,sort_order,dimensions").in("content_piece_id", pieceIds),
    supabase.from("content_assets").select("content_piece_id,asset_type,file_url,text_content,asset_metadata").in("content_piece_id", pieceIds).not("file_url", "is", null),
  ]) : [{ data: [] }, { data: [] }];
  const imagesByPiece = new Map<string, NonNullable<typeof imageRows>>();
  const assetsByPiece = new Map<string, NonNullable<typeof assetRows>>();
  for (const row of imageRows || []) imagesByPiece.set(row.content_piece_id, [...(imagesByPiece.get(row.content_piece_id) || []), row]);
  for (const row of assetRows || []) assetsByPiece.set(row.content_piece_id, [...(assetsByPiece.get(row.content_piece_id) || []), row]);
  const pieces = [];
  for (const piece of approved || []) {
    const media = resolvePieceMedia(piece, imagesByPiece.get(piece.id) || [], assetsByPiece.get(piece.id) || []);
    const supportedVideo = (piece.content_type === "video" || piece.content_type === "video_script") && media.shape === "video" && media.items.length === 1 && media.items[0].kind === "video";
    const supportedPost = piece.content_type === "social_post" && !["images", "document", "video"].includes(media.shape);
    if (!supportedVideo && !supportedPost) continue;
    pieces.push({
      id: piece.id,
      title: piece.title || "Untitled",
      contentType: piece.content_type,
      mediaKind: media.items[0]?.kind || null,
    });
  }

  return NextResponse.json({ configured, enabledNetworks, accounts, pieces }, { headers: NO_CACHE });
}

/** Enqueues only approved content for an explicitly selected, company-owned direct-social account. */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as {
    companyId?: string; pieceId?: string; socialAccountId?: string; platform?: string;
    scheduledFor?: string | null; options?: unknown;
  } | null;
  if (!body?.companyId) return NextResponse.json({ error: "companyId is required" }, { status: 400 });
  const user = await requireCompanyUser(body.companyId);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "admin" && !user.can_publish) return NextResponse.json({ error: "Your account cannot publish." }, { status: 403 });
  const hospitalityRefusal = await refuseHospitality(user, body.companyId);
  if (hospitalityRefusal) return hospitalityRefusal;
  if (!body.pieceId || !body.socialAccountId || !isDirectSocialPlatform(body.platform)) return NextResponse.json({ error: "Choose approved content, a platform and one connected account." }, { status: 400 });
  const platform: DirectSocialPlatform = body.platform;
  if (!directSocialConfigured(platform) || !getDirectSocialAdapter(platform)) return NextResponse.json({ error: "This publishing destination is not configured." }, { status: 503 });
  const options = validateDirectSocialOptions(platform, body.options ?? {});
  if (!options) return NextResponse.json({ error: "The publishing options are incomplete or invalid." }, { status: 400 });
  const scheduledFor = body.scheduledFor || null;
  if (scheduledFor && (!Number.isFinite(Date.parse(scheduledFor)) || Date.parse(scheduledFor) <= Date.now())) return NextResponse.json({ error: "Choose a future date and time." }, { status: 400 });

  const supabase = await createAdminSupabaseClient();
  const [{ data: piece }, { data: account }, { data: company }] = await Promise.all([
    supabase.from("content_pieces").select("id,company_id,approval_status,content_type,markdown_body,title,cover_image_url")
      .eq("id", body.pieceId).eq("company_id", body.companyId).maybeSingle(),
    supabase.from("company_social_accounts").select("id,company_id,platform,account_id,account_name,access_token_encrypted,refresh_token_encrypted,token_expires_at,is_active,platform_metadata")
      .eq("id", body.socialAccountId).eq("company_id", body.companyId).eq("platform", platform).eq("is_active", true).maybeSingle(),
    supabase.from("companies").select("social_networks").eq("id", body.companyId).maybeSingle(),
  ]);
  if (!piece || piece.approval_status !== "approved") return NextResponse.json({ error: "Choose approved content from this company." }, { status: 400 });
  const enabled = Array.isArray(company?.social_networks) ? company.social_networks : [];
  if (!enabled.includes(directSocialNetwork(platform))) return NextResponse.json({ error: "This destination is not enabled for the company." }, { status: 403 });
  const expiry = account?.token_expires_at ? Date.parse(account.token_expires_at) : null;
  let refreshable = !!account?.refresh_token_encrypted;
  try {
    if (platform === "bluesky" && account?.access_token_encrypted) refreshable ||= JSON.parse(decrypt(account.access_token_encrypted))?.marker === BLUESKY_SESSION_MARKER;
  } catch { refreshable = false; }
  if (!account || !account.account_id || !account.access_token_encrypted || (expiry !== null && (!Number.isFinite(expiry) || (expiry <= Date.now() && (!refreshable || platform === "threads"))))) return NextResponse.json({ error: "Choose a usable connected account. It may need reconnecting." }, { status: 404 });

  const [{ data: images }, { data: assets }] = await Promise.all([
    supabase.from("content_images").select("public_url,filename,sort_order,dimensions").eq("content_piece_id", piece.id),
    supabase.from("content_assets").select("asset_type,file_url,text_content,asset_metadata").eq("content_piece_id", piece.id).not("file_url", "is", null),
  ]);
  const resolved = resolvePieceMedia(piece, images || [], assets || []);
  const text = toDirectSocialText(piece.markdown_body || "");
  if (!text) return NextResponse.json({ error: "The approved piece has no publishable text." }, { status: 422 });
  let media: DirectSocialMedia | null = null;
  if (platform === "youtube") {
    if (!piece.title?.trim() || !["video", "video_script"].includes(piece.content_type) || resolved.shape !== "video" || resolved.items.length !== 1 || resolved.items[0].kind !== "video") return NextResponse.json({ error: "YouTube needs an approved title and one rendered video asset." }, { status: 422 });
  } else if (piece.content_type !== "social_post" || ["images", "document", "video"].includes(resolved.shape)) {
    return NextResponse.json({ error: "This destination supports approved social posts with text or one image only." }, { status: 422 });
  }
  if (resolved.items.length) {
    const item = resolved.items[0];
    if (!isDirectSocialPublicMediaUrl(item.url) || (platform === "youtube" ? item.kind !== "video" : item.kind !== "image")) return NextResponse.json({ error: "The approved media type or storage location is not supported." }, { status: 422 });
    const response = await fetch(item.url, { method: "HEAD", redirect: "error", cache: "no-store", signal: AbortSignal.timeout(12_000) }).catch(() => null);
    const mimeType = (response?.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    const size = Number(response?.headers.get("content-length") || 0);
    if (!response?.ok || !mimeType || (platform !== "youtube" && !mimeType.startsWith("image/")) || (platform === "youtube" && !mimeType.startsWith("video/")) || !Number.isFinite(size) || size <= 0) return NextResponse.json({ error: "The approved media could not be validated for this destination." }, { status: 422 });
    if (item.kind !== "image" && item.kind !== "video") return NextResponse.json({ error: "This media type is not supported." }, { status: 422 });
    media = { url: item.url, kind: item.kind, mimeType };
  }
  if (platform === "youtube" && !media) return NextResponse.json({ error: "YouTube needs one rendered video asset." }, { status: 422 });
  if ((platform === "pinterest" || platform === "youtube") && !piece.title?.trim()) return NextResponse.json({ error: "This destination requires an approved title." }, { status: 422 });
  const id = directSocialJobId(body.companyId, piece.id, account.id, platform);
  const { data: job, error } = await supabase.from("publishing_jobs").insert({
    id, company_id: body.companyId, content_piece_id: piece.id, social_account_id: account.id,
    target_platform: platform, status: scheduledFor ? "scheduled" : "queued", scheduled_for: scheduledFor,
    triggered_by: user.id,
    publish_payload: { provider: "direct-social-v1", platform, account_id: account.account_id, text, title: piece.title?.trim() || null, media, options },
  }).select("id,status,scheduled_for,social_account_id,target_platform").maybeSingle();
  if (error?.code === "23505") return NextResponse.json({ error: "This approved piece has already been queued for this account. Check its status before taking further action." }, { status: 409 });
  if (error || !job) return NextResponse.json({ error: "Could not queue this post." }, { status: 500 });
  return NextResponse.json({ data: job }, { status: 201 });
}

/** Disconnects only the selected company-owned account and clears its encrypted credentials. */
export async function DELETE(request: Request) {
  const body = await request.json().catch(() => null) as { companyId?: string; socialAccountId?: string } | null;
  if (!body?.companyId || !body.socialAccountId) return NextResponse.json({ error: "companyId and socialAccountId are required" }, { status: 400 });
  const user = await requireCompanyUser(body.companyId);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "admin" && !user.can_publish) return NextResponse.json({ error: "Your account cannot manage publishing." }, { status: 403 });
  const supabase = await createAdminSupabaseClient();
  const { data: account } = await supabase.from("company_social_accounts").select("id,platform")
    .eq("id", body.socialAccountId).eq("company_id", body.companyId).in("platform", ["bluesky", "threads", "twitter", "pinterest", "youtube"]).maybeSingle();
  if (!account) return NextResponse.json({ error: "Connected account not found." }, { status: 404 });
  const { error } = await supabase.from("company_social_accounts").update({ is_active: false, access_token_encrypted: null, refresh_token_encrypted: null })
    .eq("id", account.id).eq("company_id", body.companyId);
  if (error) return NextResponse.json({ error: "Could not disconnect this account." }, { status: 500 });
  return NextResponse.json({ disconnected: true });
}
