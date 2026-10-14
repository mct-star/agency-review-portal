import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { authoriseCompany } from "@/lib/media/access";
import { validateSettings } from "@/lib/hospitality/settings";

/**
 * GET /api/company/hospitality?companyId=    the company's pack, networks and venue settings
 * PUT /api/company/hospitality  { companyId, ...fields }
 *
 * A company member (or an admin) can change only the fields validateSettings
 * allows: the pack, the networks posts are exported to, the venue notes and
 * hashtags, and the daily weather post settings. Never the plan.
 */
const COLUMNS =
  "post_pack, social_networks, hospitality_settings, postcode, latitude, longitude, timezone, weather_post_enabled, weather_post_time, weather_post_for";

export async function GET(request: Request) {
  const companyId = new URL(request.url).searchParams.get("companyId");
  const access = await authoriseCompany(companyId);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  const supabase = await createAdminSupabaseClient();
  const { data, error } = await supabase.from("companies").select(COLUMNS).eq("id", companyId).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function PUT(request: Request) {
  const body = await request.json().catch(() => ({}));
  const access = await authoriseCompany(body.companyId);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  const result = validateSettings(body);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });

  const supabase = await createAdminSupabaseClient();
  const patch: Record<string, unknown> = { ...result.patch };
  if (result.patch.hospitality_settings) {
    // Merge into what is stored so saving one field does not wipe the others.
    const { data: current } = await supabase.from("companies").select("hospitality_settings").eq("id", body.companyId).maybeSingle();
    patch.hospitality_settings = { ...((current?.hospitality_settings as object) ?? {}), ...result.patch.hospitality_settings };
  }
  // Choosing the hospitality pack points the exports at Facebook and Instagram
  // unless the person has already chosen networks.
  if (result.patch.post_pack === "hospitality" && result.patch.social_networks === undefined) {
    const { data: current } = await supabase.from("companies").select("social_networks").eq("id", body.companyId).maybeSingle();
    if (!current?.social_networks || (current.social_networks as string[]).length === 0) patch.social_networks = ["facebook", "instagram"];
  }

  const { data, error } = await supabase.from("companies").update(patch).eq("id", body.companyId).select(COLUMNS).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  revalidatePath("/", "layout");
  return NextResponse.json({ data });
}
