import { NextResponse } from "next/server";
import { getUserProfile, createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

const VALID_STATUSES = ["open", "investigating", "in_progress", "resolved", "closed", "wont_fix"];

export async function GET() {
  const profile = await getUserProfile();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = await createServerSupabaseClient();
  const isAdmin = profile.role === "admin";

  let query = supabase
    .from("support_tickets")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);

  if (!isAdmin) {
    query = query.eq("user_id", profile.id);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ tickets: data || [] });
}

export async function POST(request: Request) {
  const profile = await getUserProfile();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { title, description, category, priority, pageUrl, browserInfo, screenSize, errorMessage, consoleErrors } = body;

  if (!title || !description) {
    return NextResponse.json({ error: "Title and description required" }, { status: 400 });
  }

  const supabase = await createAdminSupabaseClient();

  const { data, error } = await supabase.from("support_tickets").insert({
    company_id: profile.company_id || null,
    user_id: profile.id,
    reporter_name: profile.full_name || profile.email,
    reporter_email: profile.email,
    title,
    description,
    category: category || "bug",
    priority: priority || "medium",
    page_url: pageUrl || null,
    browser_info: browserInfo || null,
    screen_size: screenSize || null,
    error_message: errorMessage || null,
    console_errors: consoleErrors || null,
  }).select("id").single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ticket: data, created: true });
}

export async function PATCH(request: Request) {
  const profile = await getUserProfile();
  if (!profile || profile.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { ticketId, status } = body;

  if (!ticketId || !status || !VALID_STATUSES.includes(status)) {
    return NextResponse.json({ error: "Valid ticketId and status required" }, { status: 400 });
  }

  const supabase = await createAdminSupabaseClient();

  const updates: Record<string, unknown> = {
    status,
    updated_at: new Date().toISOString(),
  };

  if (status === "resolved") {
    updates.resolved_at = new Date().toISOString();
    updates.resolved_by = profile.full_name || profile.email;
  }

  const { error } = await supabase
    .from("support_tickets")
    .update(updates)
    .eq("id", ticketId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ updated: true });
}
