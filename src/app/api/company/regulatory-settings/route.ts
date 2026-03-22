import { NextResponse } from "next/server";
import { requireAdmin, createAdminSupabaseClient } from "@/lib/supabase/admin";

/**
 * PATCH /api/company/regulatory-settings
 *
 * Updates the regulatory framework and auto-review settings for a company.
 *
 * Body: {
 *   companyId: string,
 *   regulatory_framework: string,
 *   auto_regulatory_review: boolean,
 * }
 */
export async function PATCH(request: Request) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { companyId, regulatory_framework, auto_regulatory_review } = body;

  if (!companyId) {
    return NextResponse.json({ error: "companyId required" }, { status: 400 });
  }

  const validFrameworks = ["abpi", "fda", "mhra", "eu_mdr", "general_healthcare", "custom"];
  if (regulatory_framework && !validFrameworks.includes(regulatory_framework)) {
    return NextResponse.json({ error: "Invalid framework" }, { status: 400 });
  }

  const supabase = await createAdminSupabaseClient();

  const updates: Record<string, unknown> = {};
  if (regulatory_framework !== undefined) updates.regulatory_framework = regulatory_framework;
  if (auto_regulatory_review !== undefined) updates.auto_regulatory_review = auto_regulatory_review;

  const { error } = await supabase
    .from("companies")
    .update(updates)
    .eq("id", companyId);

  if (error) {
    console.error("[regulatory-settings] Update error:", error);
    return NextResponse.json({ error: "Failed to update settings" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
