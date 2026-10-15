import { NextResponse } from "next/server";
import { requireCompanyUser, createAdminSupabaseClient } from "@/lib/supabase/admin";

/**
 * GET /api/config/topic-bank?companyId=uuid
 * List all topics for a company.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const companyId = searchParams.get("companyId");
  if (!companyId) {
    return NextResponse.json(
      { error: "companyId is required" },
      { status: 400 }
    );
  }

  const user = await requireCompanyUser(companyId);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = await createAdminSupabaseClient();
  const { data, error } = await supabase
    .from("topic_bank")
    .select("*")
    .eq("company_id", companyId)
    .order("topic_number");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data: data || [] });
}

/**
 * POST /api/config/topic-bank
 * Create a new topic or bulk-import topics.
 * Body: { companyId, topics: [{ topicNumber, title, pillar?, audienceTheme?, description?, sourceReference? }] }
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({} as Record<string, unknown>));
  const { companyId, topics } = body;

  if (!companyId || !topics || !Array.isArray(topics) || topics.length === 0) {
    return NextResponse.json(
      { error: "companyId and a non-empty topics array are required" },
      { status: 400 }
    );
  }

  const user = await requireCompanyUser(companyId);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = await createAdminSupabaseClient();

  const rows = topics.map(
    (t: {
      topicNumber: number;
      title: string;
      pillar?: string;
      audienceTheme?: string;
      description?: string;
      sourceReference?: string;
    }) => ({
      company_id: companyId,
      topic_number: t.topicNumber,
      title: t.title,
      pillar: t.pillar || null,
      audience_theme: t.audienceTheme || null,
      description: t.description || null,
      source_reference: t.sourceReference || null,
    })
  );

  const { data, error } = await supabase
    .from("topic_bank")
    .upsert(rows, { onConflict: "company_id,topic_number" })
    .select();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data, count: data?.length || 0 });
}

/**
 * PUT /api/config/topic-bank
 * Update a single topic.
 * Body: { id, title?, pillar?, audienceTheme?, description?, sourceReference?, isUsed? }
 */
export async function PUT(request: Request) {
  const body = await request.json().catch(() => ({} as Record<string, unknown>));
  const { id, ...updates } = body;

  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const supabase = await createAdminSupabaseClient();

  // Load the row first: the caller must belong to the topic's company.
  const { data: existing } = await supabase
    .from("topic_bank")
    .select("company_id")
    .eq("id", id)
    .single();
  const user = existing ? await requireCompanyUser(existing.company_id) : null;
  if (!existing || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const row: Record<string, unknown> = {};
  if (updates.title !== undefined) row.title = updates.title;
  if (updates.pillar !== undefined) row.pillar = updates.pillar;
  if (updates.audienceTheme !== undefined)
    row.audience_theme = updates.audienceTheme;
  if (updates.description !== undefined) row.description = updates.description;
  if (updates.sourceReference !== undefined)
    row.source_reference = updates.sourceReference;
  if (updates.isUsed !== undefined) row.is_used = updates.isUsed;

  const { data, error } = await supabase
    .from("topic_bank")
    .update(row)
    .eq("id", id)
    .eq("company_id", existing.company_id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data });
}

/**
 * DELETE /api/config/topic-bank
 * Remove a topic.
 * Body: { id }
 */
export async function DELETE(request: Request) {
  const body = await request.json().catch(() => ({} as Record<string, unknown>));
  const { id } = body;

  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const supabase = await createAdminSupabaseClient();

  // Load the row first: the caller must belong to the topic's company.
  const { data: existing } = await supabase
    .from("topic_bank")
    .select("company_id")
    .eq("id", id)
    .single();
  const user = existing ? await requireCompanyUser(existing.company_id) : null;
  if (!existing || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { error } = await supabase
    .from("topic_bank")
    .delete()
    .eq("id", id)
    .eq("company_id", existing.company_id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
