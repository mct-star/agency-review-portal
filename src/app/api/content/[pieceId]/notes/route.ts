import { NextResponse } from "next/server";
import { createAdminSupabaseClient, getSignedInProfile } from "@/lib/supabase/admin";
import { canAccessCompany } from "@/lib/auth/permissions";
import { MAX_NOTE_LENGTH, sortNotes } from "@/lib/content/review-notes";

/**
 * Dictated review notes on one piece (12 Nov 2026), from the dictate bar
 * on /content/[pieceId]. Table: review_notes (migration 20261112090000).
 *
 *   GET     list the piece's notes in article order
 *   POST    { body, paragraphIndex?, paragraphQuote? } add one
 *   DELETE  ?noteId=  remove one (its author, or an admin)
 *
 * The piece is read first and its company checked against the caller;
 * every query on review_notes is then filtered on that company.
 */
type Params = { params: Promise<{ pieceId: string }> };

const COLUMNS = "id, content_piece_id, paragraph_index, paragraph_quote, body, created_at, user_id";

type Authorised = {
  ok: true;
  profile: NonNullable<Awaited<ReturnType<typeof getSignedInProfile>>>;
  supabase: Awaited<ReturnType<typeof createAdminSupabaseClient>>;
  companyId: string;
};

async function authorise(pieceId: string): Promise<Authorised | { ok: false; error: NextResponse }> {
  const profile = await getSignedInProfile();
  if (!profile) return { ok: false, error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const supabase = await createAdminSupabaseClient();
  const { data: piece } = await supabase
    .from("content_pieces").select("id, company_id").eq("id", pieceId).maybeSingle();
  if (!piece || !canAccessCompany(profile, piece.company_id)) {
    return { ok: false, error: NextResponse.json({ error: "Content piece not found" }, { status: 404 }) };
  }
  return { ok: true, profile, supabase, companyId: piece.company_id as string };
}

export async function GET(_request: Request, { params }: Params) {
  const { pieceId } = await params;
  const auth = await authorise(pieceId);
  if (!auth.ok) return auth.error;
  const { data, error } = await auth.supabase
    .from("review_notes").select(COLUMNS)
    .eq("content_piece_id", pieceId).eq("company_id", auth.companyId)
    .order("created_at", { ascending: true });
  if (error) return NextResponse.json({ error: "Could not load the notes." }, { status: 500 });
  return NextResponse.json({ notes: sortNotes(data || []) });
}

export async function POST(request: Request, { params }: Params) {
  const { pieceId } = await params;
  const auth = await authorise(pieceId);
  if (!auth.ok) return auth.error;

  const input = await request.json().catch(() => ({} as Record<string, unknown>));
  const body = typeof input.body === "string" ? input.body.trim() : "";
  if (!body) return NextResponse.json({ error: "The note is empty." }, { status: 400 });
  if (body.length > MAX_NOTE_LENGTH) return NextResponse.json({ error: "That note is too long." }, { status: 400 });
  const index = input.paragraphIndex;
  const paragraphIndex = typeof index === "number" && Number.isInteger(index) && index >= 0 ? index : null;
  const quote = typeof input.paragraphQuote === "string" ? input.paragraphQuote.trim().slice(0, 300) : "";

  const { data, error } = await auth.supabase
    .from("review_notes")
    .insert({
      content_piece_id: pieceId,
      company_id: auth.companyId,
      user_id: auth.profile.id,
      paragraph_index: paragraphIndex,
      paragraph_quote: paragraphIndex === null ? null : quote || null,
      body,
    })
    .select(COLUMNS)
    .single();
  if (error || !data) return NextResponse.json({ error: "Could not save the note." }, { status: 500 });
  return NextResponse.json({ note: data }, { status: 201 });
}

export async function DELETE(request: Request, { params }: Params) {
  const { pieceId } = await params;
  const auth = await authorise(pieceId);
  if (!auth.ok) return auth.error;
  const noteId = new URL(request.url).searchParams.get("noteId");
  if (!noteId) return NextResponse.json({ error: "noteId is required" }, { status: 400 });

  let query = auth.supabase.from("review_notes").delete()
    .eq("id", noteId).eq("content_piece_id", pieceId).eq("company_id", auth.companyId);
  if (auth.profile.role !== "admin") query = query.eq("user_id", auth.profile.id);
  const { error } = await query;
  if (error) return NextResponse.json({ error: "Could not remove the note." }, { status: 500 });
  return NextResponse.json({ ok: true });
}
