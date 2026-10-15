import { NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { authorisePiece } from "@/lib/hospitality/access";
import { getPostType } from "@/lib/constants/post-types";
import { generateHospitalityPost } from "@/lib/hospitality/generate";
import { readSettings, wordCount } from "@/lib/hospitality/prompts";
import { longDateLabel } from "@/lib/hospitality/week";
import { buildSlotBrief, ITEM_COLUMNS, toItem, type SlotKind } from "@/lib/hospitality/coming-up";

const SLOTS: SlotKind[] = ["week", "two_days", "day_of", "reveal", "still_on"];

export const maxDuration = 60;

/**
 * POST /api/hospitality/pieces/[id]/rewrite
 *
 * Write a waiting draft again, from what it was written from: the forecast
 * for the weather post, the person's note for the others. When the original
 * note was not kept, the current text is the note, so its facts carry over
 * and nothing new is invented. A Coming up post (source_meta.calendar_item_id)
 * is written from its item as it stands now, so an edit to the item carries
 * into the post. The photo stays as it is.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await authorisePiece(id);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  if (access.piece.approval_status === "approved") {
    return NextResponse.json({ error: "This post is approved. Change it back to a draft to write it again." }, { status: 409 });
  }

  const supabase = await createAdminSupabaseClient();
  const [{ data: piece }, { data: company }] = await Promise.all([
    supabase.from("content_pieces").select("id, post_type, markdown_body, scheduled_date, source_meta").eq("id", id).maybeSingle(),
    supabase.from("companies").select("name, industry, description, hospitality_settings").eq("id", access.piece.company_id).maybeSingle(),
  ]);
  if (!piece || !company) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const postType = getPostType((piece.post_type as string) || "");
  if (!postType || postType.pack !== "hospitality") {
    return NextResponse.json({ error: "Only venue posts can be written again here." }, { status: 400 });
  }

  const meta = (piece.source_meta || {}) as Record<string, unknown>;
  const facts = typeof meta.facts === "string" ? meta.facts : null;
  const keptBrief = typeof meta.brief === "string" && meta.brief.trim() ? meta.brief : null;
  let itemBrief: string | null = null;
  // A Coming up post: rewrite from the item, read within the piece's own company.
  if (typeof meta.calendar_item_id === "string" && SLOTS.includes(meta.slot as SlotKind)) {
    const { data: row } = await supabase
      .from("venue_calendar_items")
      .select(ITEM_COLUMNS)
      .eq("id", meta.calendar_item_id)
      .eq("company_id", access.piece.company_id)
      .maybeSingle();
    // If the item has gone, the brief kept with the draft still holds its facts.
    if (row) itemBrief = buildSlotBrief(toItem(row as Record<string, unknown>), meta.slot as SlotKind, Boolean(facts));
  }
  // The weather post is written from the forecast; anything else from the note,
  // or from the current caption (without its hashtags) when the note was not kept.
  const brief = itemBrief ?? keptBrief ?? (facts ? "" : String(piece.markdown_body || "").split("\n\n#")[0]);

  let post;
  try {
    post = await generateHospitalityPost({
      company: { name: company.name as string, industry: company.industry as string | null, description: company.description as string | null, settings: readSettings(company.hospitality_settings) },
      postType,
      brief,
      forecastFacts: facts,
      dateLabel: piece.scheduled_date ? longDateLabel(piece.scheduled_date as string) : null,
    });
  } catch (err) {
    console.error("[hospitality/rewrite] generation failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "We could not write it again just now. Please try again." }, { status: 502 });
  }

  const { error } = await supabase
    .from("content_pieces")
    .update({
      markdown_body: post.body,
      word_count: wordCount(post.caption),
      source_meta: { ...meta, ...(itemBrief ? { brief: itemBrief } : {}), warnings: post.warnings, alt_text: post.altText, provider: post.provider, rewritten_at: new Date().toISOString() },
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) return NextResponse.json({ error: "The new version could not be saved. Please try again." }, { status: 500 });
  return NextResponse.json({ body: post.body, warnings: post.warnings });
}
