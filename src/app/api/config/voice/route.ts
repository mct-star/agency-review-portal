import { NextResponse } from "next/server";
import { requireAdmin, createAdminSupabaseClient } from "@/lib/supabase/admin";

export async function GET(request: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const companyId = searchParams.get("companyId");
  if (!companyId) return NextResponse.json({ error: "companyId required" }, { status: 400 });

  const supabase = await createAdminSupabaseClient();
  const { data, error } = await supabase
    .from("company_voice_profiles")
    .select("*")
    .eq("company_id", companyId)
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (error && error.code !== "PGRST116") {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data: data || null });
}

export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const {
    companyId,
    voice_description,
    writing_samples,
    banned_vocabulary,
    signature_devices,
    emotional_register,
    source,
    raw_analysis,
  } = body;

  if (!companyId) return NextResponse.json({ error: "companyId required" }, { status: 400 });

  const supabase = await createAdminSupabaseClient();

  // Deactivate any existing profiles
  await supabase
    .from("company_voice_profiles")
    .update({ is_active: false })
    .eq("company_id", companyId);

  // Create new active profile
  const { data, error } = await supabase
    .from("company_voice_profiles")
    .insert({
      company_id: companyId,
      source: source || "manual",
      voice_description: voice_description || null,
      writing_samples: writing_samples || null,
      banned_vocabulary: banned_vocabulary || null,
      signature_devices: signature_devices || null,
      emotional_register: emotional_register || null,
      raw_analysis: raw_analysis || {},
      is_active: true,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}
