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
import { isProductionImageType } from "./image-types";
import { loadProfilePhoto, requireProfileAuthor } from "./profile-author";

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

export interface ProfileStatementCopy { statement: string; proof: string; payoff: string }
export interface ProfileCardAuthor { name: string; tagline?: string | null; /** A data URI. Satori never fetches. */ photoDataUri: string }

export const PROFILE_CARD_SIZE = { width: 1080, height: 1350 } as const;

const wordCount = (text: string) => text.split(/\s+/).filter(Boolean).length;
const sentencesOf = (text: string) => text.split(/(?<=[.!?])\s+/).map((part) => part.trim()).filter(Boolean);
// Built from code points: the long dashes must not appear as typed characters in source.
const LONG_DASHES = new RegExp(`[${String.fromCodePoint(0x2013)}${String.fromCodePoint(0x2014)}]`);
const EMOJI = /\p{Extended_Pictographic}/u;
const HASHTAG = /(^|\s)#\w/;
const ABSOLUTES = /\b(inevitabl[ey]|guarantee[ds]?|always works?|never fails?|without fail)\b/i;

function beat(value: unknown, label: string, rules: { minWords?: number; maxWords: number; minSentences?: number; maxSentences: number }): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`Image copy needs a ${label}. Rewrite the image_copy asset.`);
  const text = value.trim().replace(/\s+/g, " ");
  const words = wordCount(text);
  const sentences = sentencesOf(text).length;
  if (words > rules.maxWords || words < (rules.minWords ?? 1)) {
    throw new Error(`Image copy needs a ${label} of ${rules.minWords ?? 1} to ${rules.maxWords} words, not ${words}. Rewrite the image_copy asset.`);
  }
  const minSentences = rules.minSentences ?? 1;
  if (sentences > rules.maxSentences || sentences < minSentences) {
    const wanted = rules.maxSentences === minSentences ? `${rules.maxSentences} sentence${rules.maxSentences === 1 ? "" : "s"}` : `${minSentences} to ${rules.maxSentences} sentences`;
    throw new Error(`Image copy needs a ${label} of ${wanted}, not ${sentences}. Rewrite the image_copy asset.`);
  }
  if (LONG_DASHES.test(text)) throw new Error(`Image copy ${label} must not contain a long dash. Rewrite the image_copy asset.`);
  if (EMOJI.test(text)) throw new Error(`Image copy ${label} must not contain an emoji. Rewrite the image_copy asset.`);
  if (HASHTAG.test(text)) throw new Error(`Image copy ${label} must not contain a hashtag. Rewrite the image_copy asset.`);
  if (ABSOLUTES.test(text)) throw new Error(`Image copy ${label} must not make an absolute guarantee. Rewrite the image_copy asset.`);
  return text;
}

/** Three beats, 25 to 45 words in all. Fails with a rewrite instruction rather than rendering a wall of text. */
export function parseProfileStatementCopy(output: ContentGenerationOutput): ProfileStatementCopy {
  const asset = output.assets?.find((item) => item.assetType === "image_copy");
  let raw: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(asset?.textContent ?? "");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Invalid object");
    raw = parsed as Record<string, unknown>;
  } catch {
    throw new Error("A profile statement needs a valid image_copy JSON asset with statement, proof and payoff.");
  }
  const copy = {
    statement: beat(raw.statement, "statement", { minWords: 6, maxWords: 16, maxSentences: 1 }),
    proof: beat(raw.proof, "proof", { maxWords: 25, minSentences: 2, maxSentences: 4 }),
    payoff: beat(raw.payoff, "payoff", { maxWords: 10, maxSentences: 1 }),
  };
  const total = wordCount(copy.statement) + wordCount(copy.proof) + wordCount(copy.payoff);
  if (total < 25 || total > 45) {
    throw new Error(`Image copy needs 25 to 45 words across statement, proof and payoff, not ${total}. Rewrite the image_copy asset.`);
  }
  return copy;
}

/** The 4:5 profile card: the author's circular photo, name and tagline, then the three beats. Nothing else. */
export async function renderProfileStatementCard(author: ProfileCardAuthor, copy: ProfileStatementCopy): Promise<Buffer> {
  const { width, height } = PROFILE_CARD_SIZE;
  const text = (content: string, style: React.CSSProperties) => React.createElement("div", {
    style: { display: "flex", flexShrink: 0, lineHeight: 1.25, wordBreak: "break-word", ...style },
  }, content);
  const AVATAR = 128;
  const element = React.createElement("div", {
    style: {
      display: "flex", flexDirection: "column", justifyContent: "center", width, height, padding: 96,
      backgroundColor: "#0B1020", color: "#FFFFFF", fontFamily: "Poppins",
    },
  },
  React.createElement("div", { style: { display: "flex", alignItems: "center", flexShrink: 0, marginBottom: 64 } },
    React.createElement("img", { src: author.photoDataUri, width: AVATAR, height: AVATAR, style: { width: AVATAR, height: AVATAR, borderRadius: AVATAR / 2, flexShrink: 0 } }),
    React.createElement("div", { style: { display: "flex", flexDirection: "column", marginLeft: 36, width: width - 192 - AVATAR - 36 } },
      text(author.name, { fontSize: 42, fontWeight: 700 }),
      author.tagline ? text(author.tagline, { fontSize: 30, color: "#8E97AB", marginTop: 6 }) : null,
    ),
  ),
  text(copy.statement, { fontSize: 62, fontWeight: 700, lineHeight: 1.2, marginBottom: 48 }),
  React.createElement("div", { style: { display: "flex", flexDirection: "column", flexShrink: 0, marginBottom: 48 } },
    ...sentencesOf(copy.proof).map((line, index) => text(line, { fontSize: 44, color: "#D5D9E5", lineHeight: 1.3, marginTop: index ? 10 : 0 })),
  ),
  text(copy.payoff, { fontSize: 40, fontWeight: 700, lineHeight: 1.3 }),
  );
  let overflowing = false;
  const svg = await satori(element, {
    width, height, fonts: bundledFonts(),
    onNodeDetected: (node) => {
      if (node.left < 0 || node.top < 0 || node.left + node.width > width + 1 || node.top + node.height > height + 1) overflowing = true;
    },
  });
  if (overflowing) throw new Error("Image copy does not fit the profile card. Shorten the statement, proof or payoff and retry.");
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
  if (!isProductionImageType(postTypeSlug)) return undefined;
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
    let buffer: Buffer;
    if (postTypeSlug === "profile_statement") {
      const copy = parseProfileStatementCopy(output);
      const author = await requireProfileAuthor(db, company.id, pieceId);
      const photoDataUri = await loadProfilePhoto(author.photoUrl);
      buffer = await renderProfileStatementCard({ name: author.name, tagline: author.tagline, photoDataUri }, copy);
    } else {
      buffer = await renderProductionGraphic(company, postTypeSlug, parseProductionImageCopy(output, postTypeSlug));
    }
    const size = await sharp(buffer).metadata();
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
      storage_path: path, public_url: publicUrl, archetype: postTypeSlug, dimensions: `${size.width}x${size.height}`, sort_order: 0,
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
