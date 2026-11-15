import { NextResponse } from "next/server";
import sharp from "sharp";
import { createAdminSupabaseClient, requireCompanyUser } from "@/lib/supabase/admin";
import { PUBLISHED_BUCKET } from "@/lib/upload/media-constants";
import { nextImageSortOrder } from "@/lib/media/publish-copy";
import { roleForArchetype, SHARE_ARCHETYPE } from "@/lib/publishing/blog-gate-input";
import { MAX_SHARE_BYTES, SHARE_TOO_LARGE } from "@/lib/publishing/share-image";
import { loadBlogImagesPayload, mergeImageRecord, writeFailure, type BlogPieceForImages } from "@/lib/publishing/blog-images";

export const maxDuration = 30;

/**
 * /api/content/[pieceId]/blog-images (15 Nov 2026): the image record on a
 * blog piece, and its share image.
 *
 * GET    the images as they would publish, each with its record, the
 *        company's gate settings and the gate's verdict.
 * PATCH  { imageId, record: { type?, passage?, treatment?, alt? } } saves
 *        the record on one of the piece's images. The role comes from where
 *        the image is used, never from the request.
 * POST   multipart, field "file": the share image (PNG, JPEG or WebP, up to
 *        4 MB, below the host's 4.5 MB request limit). It is measured
 *        here and stored whatever its size, so the gate can report a wrong
 *        size. One per piece: it replaces the last.
 *
 * Who may use it: any signed-in user with access to the piece's company,
 * that is an admin or a member of that company. An unknown piece, another
 * company's piece, a piece that is not a blog and a caller who is not
 * signed in all get the same 404, and nothing else is read or written.
 *
 * Writes fire the content_images revision trigger: a published piece
 * answers RELEASE_LOCKED and one being published RELEASE_BUSY, both 409.
 */

const NOT_FOUND = { error: "Content piece not found" };
const notFound = () => NextResponse.json(NOT_FOUND, { status: 404 });
const SHARE_FORMATS: Record<string, { ext: string; mime: string }> = {
  png: { ext: "png", mime: "image/png" },
  jpeg: { ext: "jpg", mime: "image/jpeg" },
  webp: { ext: "webp", mime: "image/webp" },
};
const SHARE_MIME_TYPES = ["image/png", "image/jpeg", "image/webp"];

type Supabase = Awaited<ReturnType<typeof createAdminSupabaseClient>>;

async function authorise(pieceId: string): Promise<{ supabase: Supabase; piece: BlogPieceForImages } | null> {
  const supabase = await createAdminSupabaseClient();
  const { data: piece } = await supabase.from("content_pieces")
    .select("id, company_id, content_type, title, markdown_body")
    .eq("id", pieceId)
    .maybeSingle();
  if (!piece || piece.content_type !== "blog_article" || !piece.company_id) return null;
  if (!(await requireCompanyUser(piece.company_id as string))) return null;
  return { supabase, piece: piece as BlogPieceForImages };
}

async function payloadResponse(supabase: Supabase, piece: BlogPieceForImages) {
  const payload = await loadBlogImagesPayload(supabase, piece);
  if ("error" in payload) return NextResponse.json({ error: payload.error }, { status: 500 });
  return NextResponse.json(payload);
}

type Params = { params: Promise<{ pieceId: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { pieceId } = await params;
  const access = await authorise(pieceId);
  if (!access) return notFound();
  return payloadResponse(access.supabase, access.piece);
}

export async function PATCH(request: Request, { params }: Params) {
  const { pieceId } = await params;
  const access = await authorise(pieceId);
  if (!access) return notFound();
  const { supabase, piece } = access;

  const raw: unknown = await request.json().catch(() => null);
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return NextResponse.json({ error: "Send the image and its record to save." }, { status: 400 });
  }
  const body = raw as Record<string, unknown>;
  const imageId = typeof body.imageId === "string" ? body.imageId : "";
  if (!imageId) return NextResponse.json({ error: "Say which image to save." }, { status: 400 });

  const { data: image } = await supabase.from("content_images")
    .select("id, archetype, image_record")
    .eq("id", imageId)
    .eq("content_piece_id", piece.id)
    .maybeSingle();
  if (!image) return notFound();

  const role = roleForArchetype(image.archetype as string | null);
  if (!role) {
    return NextResponse.json({ error: "This image is not the hero, an inline image or the share image, so it has no record to keep." }, { status: 400 });
  }
  const merged = mergeImageRecord(role, image.image_record, body.record);
  if ("error" in merged) return NextResponse.json({ error: merged.error }, { status: 400 });

  const { error } = await supabase.from("content_images")
    .update({ image_record: merged.record })
    .eq("id", imageId)
    .eq("content_piece_id", piece.id);
  if (error) {
    const failure = writeFailure(error);
    return NextResponse.json({ error: failure.error }, { status: failure.status });
  }
  return payloadResponse(supabase, piece);
}

export async function POST(request: Request, { params }: Params) {
  const { pieceId } = await params;
  const access = await authorise(pieceId);
  if (!access) return notFound();
  const { supabase, piece } = access;

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!file || typeof file === "string") return NextResponse.json({ error: "Choose an image file to upload." }, { status: 400 });
  if (file.type && !SHARE_MIME_TYPES.includes(file.type.split(";")[0].trim().toLowerCase())) {
    return NextResponse.json({ error: "The share image must be a PNG, JPEG or WebP file." }, { status: 415 });
  }
  if (file.size > MAX_SHARE_BYTES) {
    return NextResponse.json({ error: SHARE_TOO_LARGE }, { status: 413 });
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  let width: number | undefined;
  let height: number | undefined;
  let format: { ext: string; mime: string } | undefined;
  try {
    const meta = await sharp(bytes).metadata();
    width = meta.width;
    height = meta.height;
    format = meta.format ? SHARE_FORMATS[meta.format] : undefined;
  } catch {
    format = undefined;
  }
  if (!format) return NextResponse.json({ error: "The share image must be a PNG, JPEG or WebP file." }, { status: 415 });
  if (!width || !height) return NextResponse.json({ error: "That image could not be measured. Check the file opens, then try again." }, { status: 400 });

  const filename = `share-card-${Date.now()}.${format.ext}`;
  const storagePath = `images/${piece.company_id}/${piece.id}/${filename}`;
  const bucket = supabase.storage.from(PUBLISHED_BUCKET);
  const { error: uploadError } = await bucket.upload(storagePath, bytes, { contentType: format.mime, upsert: false });
  if (uploadError) return NextResponse.json({ error: "The share image could not be stored. Try again in a minute." }, { status: 500 });
  const publicUrl = bucket.getPublicUrl(storagePath).data.publicUrl;

  const { data: previous } = await supabase.from("content_images")
    .select("id, storage_path")
    .eq("content_piece_id", piece.id)
    .eq("archetype", SHARE_ARCHETYPE);

  const { error: insertError } = await supabase.from("content_images").insert({
    content_piece_id: piece.id,
    filename,
    storage_path: storagePath,
    public_url: publicUrl,
    archetype: SHARE_ARCHETYPE,
    dimensions: `${width}x${height}`,
    image_record: { role: "share", passage: "The designed 1200x630 share card" },
    sort_order: await nextImageSortOrder(supabase, piece.id),
  });
  if (insertError) {
    await bucket.remove([storagePath]);
    const failure = writeFailure(insertError);
    return NextResponse.json({ error: failure.error }, { status: failure.status });
  }

  const old = (previous || []) as Array<{ id: string; storage_path: string | null }>;
  if (old.length > 0) {
    const { error: deleteError } = await supabase.from("content_images")
      .delete()
      .in("id", old.map(r => r.id))
      .eq("content_piece_id", piece.id);
    if (deleteError) {
      const failure = writeFailure(deleteError);
      return NextResponse.json({ error: failure.error }, { status: failure.status });
    }
    // Only files this route stored for this piece; the rows are already gone.
    const ownFolder = `images/${piece.company_id}/${piece.id}/share-card-`;
    const files = old.map(r => r.storage_path).filter((p): p is string => !!p && p.startsWith(ownFolder));
    if (files.length > 0) await bucket.remove(files);
  }

  return payloadResponse(supabase, piece);
}
