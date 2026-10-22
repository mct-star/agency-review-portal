import { NextResponse } from "next/server";
import { requireCompanyUser, createAdminSupabaseClient } from "@/lib/supabase/admin";
import { postTypesForPack } from "@/lib/constants/post-types";

/**
 * GET /api/post-types?companyId=uuid
 *
 * The post types in the company's pack. Types produced on the Mac pipeline
 * (memes, mini infographics, video) are staff-only, so they are left out for
 * a client. `data` repeats `postTypes` for the Week Batch page.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const companyId = searchParams.get("companyId");
  if (!companyId) {
    return NextResponse.json({ error: "companyId is required" }, { status: 400 });
  }

  const user = await requireCompanyUser(companyId);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = await createAdminSupabaseClient();
  const { data: company } = await supabase
    .from("companies")
    .select("post_pack")
    .eq("id", companyId)
    .maybeSingle();

  const isAdmin = user.role === "admin";
  const postTypes = postTypesForPack((company as { post_pack?: string } | null)?.post_pack)
    .filter((pt) => isAdmin || pt.production !== "mac")
    .map((pt) => ({
      slug: pt.slug,
      label: pt.label,
      description: pt.description,
      archetype: pt.archetype,
      color: pt.color,
      visualTag: pt.visualTag ?? null,
      medium: pt.medium,
      production: pt.production,
    }));

  return NextResponse.json({ postTypes, data: postTypes });
}
