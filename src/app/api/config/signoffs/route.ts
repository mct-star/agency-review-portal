import { NextResponse } from "next/server";
import { requireCompanyUser, createAdminSupabaseClient } from "@/lib/supabase/admin";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const companyId = searchParams.get("companyId");
  if (!companyId) return NextResponse.json({ error: "companyId required" }, { status: 400 });

  const user = await requireCompanyUser(companyId);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = await createAdminSupabaseClient();
  const { data, error } = await supabase
    .from("company_signoffs")
    .select("*")
    .eq("company_id", companyId)
    .order("sort_order");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data || [] });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({} as Record<string, unknown>));
  const { companyId, label, signoff_text, first_comment_template } = body;
  if (!companyId || !signoff_text) return NextResponse.json({ error: "companyId and signoff_text required" }, { status: 400 });

  const user = await requireCompanyUser(companyId);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = await createAdminSupabaseClient();
  const { data, error } = await supabase
    .from("company_signoffs")
    .insert({ company_id: companyId, label: label || "Default", signoff_text, first_comment_template: first_comment_template || null })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function PUT(request: Request) {
  const body = await request.json().catch(() => ({} as Record<string, unknown>));
  const { id, label, signoff_text, first_comment_template } = body;
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const supabase = await createAdminSupabaseClient();

  // Load the row first: the caller must belong to the sign-off's company.
  const { data: existing } = await supabase
    .from("company_signoffs")
    .select("company_id")
    .eq("id", id)
    .single();
  const user = existing ? await requireCompanyUser(existing.company_id) : null;
  if (!existing || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data, error } = await supabase
    .from("company_signoffs")
    .update({ label, signoff_text, first_comment_template })
    .eq("id", id)
    .eq("company_id", existing.company_id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function DELETE(request: Request) {
  const body = await request.json().catch(() => ({} as Record<string, unknown>));
  const { id } = body;
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const supabase = await createAdminSupabaseClient();

  // Load the row first: the caller must belong to the sign-off's company.
  const { data: existing } = await supabase
    .from("company_signoffs")
    .select("company_id")
    .eq("id", id)
    .single();
  const user = existing ? await requireCompanyUser(existing.company_id) : null;
  if (!existing || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { error } = await supabase
    .from("company_signoffs")
    .delete()
    .eq("id", id)
    .eq("company_id", existing.company_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
