import { NextResponse } from "next/server";
import { requireCompanyUser, createAdminSupabaseClient } from "@/lib/supabase/admin";

/**
 * GET /api/config/person-setup?companyId=uuid&personId=uuid
 * Fetch a spokesperson's content setup fields:
 * topic_assignments, posting_schedule, signoff_template, content_strategy
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const companyId = searchParams.get("companyId");
  const personId = searchParams.get("personId");

  if (!companyId || !personId) {
    return NextResponse.json(
      { error: "companyId and personId are required" },
      { status: 400 }
    );
  }

  const user = await requireCompanyUser(companyId);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = await createAdminSupabaseClient();

  const { data, error } = await supabase
    .from("company_spokespersons")
    .select(
      "id, name, topic_assignments, posting_schedule, signoff_template, content_strategy"
    )
    .eq("id", personId)
    .eq("company_id", companyId)
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      return NextResponse.json({ error: "Spokesperson not found" }, { status: 404 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data });
}

/**
 * PUT /api/config/person-setup?companyId=uuid&personId=uuid
 * Update a spokesperson's content setup fields.
 * Body: { topic_assignments?, posting_schedule?, signoff_template?, content_strategy? }
 */
export async function PUT(request: Request) {
  const { searchParams } = new URL(request.url);
  const companyId = searchParams.get("companyId");
  const personId = searchParams.get("personId");

  if (!companyId || !personId) {
    return NextResponse.json(
      { error: "companyId and personId are required" },
      { status: 400 }
    );
  }

  const user = await requireCompanyUser(companyId);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();

  const updates: Record<string, unknown> = {};
  if (body.topic_assignments !== undefined)
    updates.topic_assignments = body.topic_assignments;
  if (body.posting_schedule !== undefined)
    updates.posting_schedule = body.posting_schedule;
  if (body.signoff_template !== undefined)
    updates.signoff_template = body.signoff_template;
  if (body.content_strategy !== undefined)
    updates.content_strategy = body.content_strategy;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json(
      { error: "No valid fields to update" },
      { status: 400 }
    );
  }

  const supabase = await createAdminSupabaseClient();

  const { data, error } = await supabase
    .from("company_spokespersons")
    .update(updates)
    .eq("id", personId)
    .eq("company_id", companyId)
    .select(
      "id, name, topic_assignments, posting_schedule, signoff_template, content_strategy"
    )
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      return NextResponse.json({ error: "Spokesperson not found" }, { status: 404 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data });
}
