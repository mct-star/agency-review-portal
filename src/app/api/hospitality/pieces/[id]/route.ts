import { NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { authorisePiece } from "@/lib/hospitality/access";
import { stripLongDashes, wordCount } from "@/lib/hospitality/prompts";

/**
 * PATCH /api/hospitality/pieces/[id]  { body }
 * Edit the text of a draft before approving it. An approved post is locked:
 * what was approved is what exports.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await authorisePiece(id);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  if (access.piece.approval_status === "approved") {
    return NextResponse.json({ error: "This post is approved. Change it back to a draft to edit it." }, { status: 409 });
  }
  const body = await request.json().catch(() => ({}));
  if (typeof body.body !== "string" || !body.body.trim()) return NextResponse.json({ error: "The post cannot be empty" }, { status: 400 });
  const text = stripLongDashes(body.body).slice(0, 4000);
  const supabase = await createAdminSupabaseClient();
  const { error } = await supabase
    .from("content_pieces")
    .update({ markdown_body: text, word_count: wordCount(text.split("\n\n#")[0]), updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
