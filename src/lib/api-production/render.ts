/** Hosted production images: trusted layouts render structured copy without a local worker. */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import React from "react";
import satori, { type Font } from "satori";
import sharp from "sharp";
import type { ContentGenerationOutput } from "@/lib/providers";
import type { ProductionDb } from "./types";
import { productionId } from "./identity";

type ImagePostType = "meme" | "mini_infographic";
export interface ProductionImageCopy {
  title: string;
  subtitle?: string;
  points?: string[];
  footer?: string;
}

interface ImageCompany {
  id: string;
  name: string;
  brand_color: string | null;
  logo_url?: string | null;
  profile_picture_url?: string | null;
  spokesperson_name?: string | null;
}

const SIZE = 1080;
let fonts: Font[] | undefined;
function bundledFonts(): Font[] {
  if (!fonts) {
    fonts = ([400, 700] as const).map((weight) => ({
      name: "Poppins",
      data: readFileSync(join(process.cwd(), "src/lib/image/fonts", weight === 400 ? "Poppins-Regular.ttf" : "Poppins-SemiBold.ttf")),
      weight,
      style: "normal" as const,
    }));
  }
  return fonts;
}

function shortText(value: unknown, label: string, max: number, required = false): string | undefined {
  if (value === undefined && !required) return undefined;
  if (typeof value !== "string" || !value.trim() || value.trim().length > max) {
    throw new Error(`Image copy needs ${label} of 1 to ${max} characters. Rewrite the image_copy asset.`);
  }
  return value.trim().replace(/\s+/g, " ");
}

/** Fail rather than rendering a caption, a design prompt or an unreadable wall of text. */
export function parseProductionImageCopy(output: ContentGenerationOutput, postType: ImagePostType): ProductionImageCopy {
  const asset = output.assets?.find((item) => item.assetType === "image_copy");
  let raw: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(asset?.textContent ?? "");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Invalid object");
    raw = parsed as Record<string, unknown>;
  } catch {
    throw new Error("Image production needs a valid image_copy JSON asset with title, optional subtitle and footer, and points for an infographic.");
  }
  const copy: ProductionImageCopy = {
    title: shortText(raw.title, "a title", postType === "meme" ? 110 : 90, true)!,
    subtitle: shortText(raw.subtitle, "a subtitle", postType === "meme" ? 140 : 100),
    footer: shortText(raw.footer, "a footer", 100),
  };
  if (postType === "mini_infographic") {
    if (!Array.isArray(raw.points) || raw.points.length < 2 || raw.points.length > 5) {
      throw new Error("An infographic needs 2 to 5 concise points in image_copy.points.");
    }
    copy.points = raw.points.map((point) => shortText(point, "each infographic point", 110, true)!);
  }
  return copy;
}

/** Real server-rendered PNG, with no remote URLs, HTML interpretation or shell commands. */
export async function renderProductionGraphic(company: ImageCompany, postType: ImagePostType, copy: ProductionImageCopy): Promise<Buffer> {
  const accent = /^#[\da-f]{6}$/i.test(company.brand_color ?? "") ? company.brand_color! : "#A27BF9";
  const meme = postType === "meme";
  const text = (content: string, style: React.CSSProperties) => React.createElement("div", {
    style: { display: "flex", flexShrink: 0, lineHeight: 1.25, wordBreak: "break-word", ...style },
  }, content);
  const element = React.createElement("div", {
    style: {
      display: "flex", flexDirection: "column", width: SIZE, height: SIZE, padding: 64,
      backgroundColor: meme ? "#141827" : "#FAFAFC", color: meme ? "#FFFFFF" : "#141827",
      fontFamily: "Poppins", fontSize: 32,
    },
  },
  React.createElement("div", { style: { width: 88, height: 10, backgroundColor: accent, flexShrink: 0, marginBottom: 32 } }),
  React.createElement("div", { style: { display: "flex", flexDirection: "column", flex: 1, justifyContent: meme ? "center" : "flex-start" } },
    text(copy.title, { fontSize: meme ? 76 : 54, fontWeight: 700, marginBottom: copy.subtitle ? 22 : 30 }),
    copy.subtitle ? text(copy.subtitle, { fontSize: meme ? 40 : 30, color: meme ? "#D5D7E2" : "#4B5060", marginBottom: meme ? 0 : 28 }) : null,
    ...(!meme ? (copy.points ?? []).map((point, index) => React.createElement("div", {
      key: index,
      style: { display: "flex", flexShrink: 0, alignItems: "flex-start", marginBottom: 24, paddingTop: 16, borderTop: "2px solid #E2E4EB" },
    },
    text(String(index + 1).padStart(2, "0"), { width: 78, fontSize: 34, color: "#404757", fontWeight: 700 }),
    text(point, { width: 874, fontSize: 30 }),
    )) : []),
  ),
  copy.footer ? text(copy.footer, { fontSize: 24, marginTop: 20, color: meme ? "#D5D7E2" : "#4B5060" }) : null,
  text(company.name, { fontSize: 22, marginTop: 24, color: meme ? "#D5D7E2" : "#4B5060" }),
  );
  let overflowing = false;
  const svg = await satori(element, {
    width: SIZE, height: SIZE, fonts: bundledFonts(),
    onNodeDetected: (node) => {
      if (node.left < 0 || node.top < 0 || node.left + node.width > SIZE + 1 || node.top + node.height > SIZE + 1) overflowing = true;
    },
  });
  if (overflowing) throw new Error("Image copy does not fit the graphic. Shorten the image_copy title, subtitle or points and retry.");
  return sharp(Buffer.from(svg)).png().toBuffer();
}

export interface RenderProductionImageArgs {
  db: ProductionDb;
  company: ImageCompany;
  pieceId: string;
  postTypeSlug: string;
  output: ContentGenerationOutput;
  assertOwnership: () => Promise<void>;
}

/** Record the image only for the checked tenant and while this worker still owns the job. */
export async function renderProductionImage({ db, company, pieceId, postTypeSlug, output, assertOwnership }: RenderProductionImageArgs): Promise<string | undefined> {
  if (postTypeSlug !== "meme" && postTypeSlug !== "mini_infographic") return undefined;
  await assertOwnership();
  const { data: piece, error: pieceError } = await db.from("content_pieces")
    .select("id, company_id, approval_status, cover_image_url")
    .eq("id", pieceId).eq("company_id", company.id).maybeSingle();
  if (pieceError) throw new Error(`Could not check image ownership: ${pieceError.message}`);
  if (!piece || piece.company_id !== company.id) throw new Error("Image production cannot access this content piece for the company.");
  if (piece.cover_image_url) return piece.cover_image_url;
  const { data: existing, error: existingError } = await db.from("content_images")
    .select("public_url").eq("content_piece_id", pieceId).order("sort_order").limit(1).maybeSingle();
  if (existingError) throw new Error(`Could not check existing images: ${existingError.message}`);
  if (piece.approval_status === "approved") {
    if (existing?.public_url) return existing.public_url;
    throw new Error("This post is already approved. Return it to review before adding a generated image.");
  }

  let publicUrl: string | undefined = existing?.public_url;
  if (!publicUrl) {
    const copy = parseProductionImageCopy(output, postTypeSlug);
    const buffer = await renderProductionGraphic(company, postTypeSlug, copy);
    const hash = createHash("sha256").update(buffer).digest("hex").slice(0, 24);
    const filename = `api-${postTypeSlug}-${hash}.png`;
    const path = `images/${company.id}/${pieceId}/${filename}`;
    await assertOwnership();
    const { error: uploadError } = await db.storage.from("content-assets").upload(path, buffer, {
      contentType: "image/png", upsert: false, cacheControl: "31536000",
    });
    // An interrupted attempt may already have uploaded exactly these bytes.
    if (uploadError && !(String((uploadError as { statusCode?: string }).statusCode) === "409" && /already exists|duplicate/i.test(uploadError.message))) {
      throw new Error(`Could not upload production image: ${uploadError.message}`);
    }
    publicUrl = db.storage.from("content-assets").getPublicUrl(path).data.publicUrl;
    await assertOwnership();
    const { error: imageError } = await db.from("content_images").upsert({
      id: productionId(company.id, pieceId, filename), content_piece_id: pieceId, filename,
      storage_path: path, public_url: publicUrl, archetype: postTypeSlug, dimensions: `${SIZE}x${SIZE}`, sort_order: 0,
    }, { onConflict: "id", ignoreDuplicates: true });
    if (imageError) throw new Error(`Could not record production image: ${imageError.message}`);
  }
  await assertOwnership();
  const { data: updated, error: coverError } = await db.from("content_pieces")
    .update({ cover_image_url: publicUrl, image_generation_status: "completed" })
    .eq("id", pieceId).eq("company_id", company.id).neq("approval_status", "approved")
    .is("cover_image_url", null).select("id").maybeSingle();
  if (coverError) throw new Error(`Could not set production cover image: ${coverError.message}`);
  if (!updated) throw new Error("Post changed while its image was rendering. Review the existing cover before retrying.");
  return publicUrl;
}
