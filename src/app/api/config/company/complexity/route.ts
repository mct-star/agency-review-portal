import { NextResponse } from "next/server";
import { createServerSupabaseClient, getUserProfile } from "@/lib/supabase/server";

const VALID_LEVELS = ["beginner", "intermediate", "advanced"] as const;

/**
 * POST /api/config/company/complexity
 * Update a company's setup_complexity level.
 * Body: { companyId: string, complexity: "beginner" | "intermediate" | "advanced" }
 */
export async function POST(request: Request) {
  const profile = await getUserProfile();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { companyId, complexity } = body;

  if (!companyId || !complexity) {
    return NextResponse.json({ error: "companyId and complexity are required" }, { status: 400 });
  }

  if (!VALID_LEVELS.includes(complexity)) {
    return NextResponse.json(
      { error: `complexity must be one of: ${VALID_LEVELS.join(", ")}` },
      { status: 400 }
    );
  }

  // Access control: clients can only update their own company
  const isAdmin = profile.role === "admin";
  if (!isAdmin && profile.company_id !== companyId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase
    .from("companies")
    .update({ setup_complexity: complexity })
    .eq("id", companyId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
