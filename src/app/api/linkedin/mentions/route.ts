import { NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { authoriseChannelManager } from "@/lib/auth/channel-manager";
import { validateMentionUrn } from "@/lib/linkedin/mentions";

/**
 * The company's name-to-URN list for real LinkedIn mentions. The same people
 * who can manage the channels can edit it: an admin, or a client of this
 * company with the publish right. Every query filters on company_id.
 */

export async function GET(request: Request) {
  const companyId = new URL(request.url).searchParams.get("companyId");
  const auth = await authoriseChannelManager(companyId, { fence: true });
  if (!auth.ok) return auth.response;
  const supabase = await createAdminSupabaseClient();
  const { data, error } = await supabase.from("linkedin_mentions").select("id, name, urn, kind")
    .eq("company_id", companyId!).order("name", { ascending: true });
  if (error) return NextResponse.json({ error: "Could not read the mention list." }, { status: 500 });
  return NextResponse.json({ mentions: data || [] }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { companyId?: string; name?: unknown; urn?: unknown; kind?: unknown } | null;
  const auth = await authoriseChannelManager(body?.companyId, { fence: true });
  if (!auth.ok) return auth.response;
  const name = typeof body?.name === "string" ? body.name.trim().replace(/\s+/g, " ") : "";
  const urn = typeof body?.urn === "string" ? body.urn.trim() : "";
  const kind = typeof body?.kind === "string" ? body.kind : "";
  if (!name || name.length > 100) return NextResponse.json({ error: "Enter the name exactly as you write it after the ＠." }, { status: 400 });
  const urnError = validateMentionUrn(kind, urn);
  if (urnError) return NextResponse.json({ error: urnError }, { status: 400 });
  const supabase = await createAdminSupabaseClient();
  const { data, error } = await supabase.from("linkedin_mentions")
    .insert({ company_id: body!.companyId, name, urn, kind }).select("id, name, urn, kind").maybeSingle();
  if (error?.code === "23505") return NextResponse.json({ error: "That name is already in the list. Delete it first to change its URN." }, { status: 409 });
  if (error || !data) return NextResponse.json({ error: "Could not save the mention." }, { status: 500 });
  return NextResponse.json({ mention: data }, { status: 201 });
}

export async function DELETE(request: Request) {
  const body = await request.json().catch(() => null) as { companyId?: string; id?: unknown } | null;
  const auth = await authoriseChannelManager(body?.companyId, { fence: true });
  if (!auth.ok) return auth.response;
  if (typeof body?.id !== "string") return NextResponse.json({ error: "id is required" }, { status: 400 });
  const supabase = await createAdminSupabaseClient();
  const { error } = await supabase.from("linkedin_mentions").delete().eq("id", body.id).eq("company_id", body.companyId!);
  if (error) return NextResponse.json({ error: "Could not delete the mention." }, { status: 500 });
  return NextResponse.json({ deleted: true });
}
