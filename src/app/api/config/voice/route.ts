import { NextResponse } from "next/server";
import { requireAdmin, createAdminSupabaseClient } from "@/lib/supabase/admin";

export async function GET(request: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const companyId = searchParams.get("companyId");
  const spokespersonId = searchParams.get("spokespersonId");
  if (!companyId) return NextResponse.json({ error: "companyId required" }, { status: 400 });

  const supabase = await createAdminSupabaseClient();

  // If spokespersonId provided, get that person's voice profile
  if (spokespersonId) {
    const { data, error } = await supabase
      .from("company_voice_profiles")
      .select("*")
      .eq("company_id", companyId)
      .eq("spokesperson_id", spokespersonId)
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (error && error.code !== "PGRST116") {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data: data || null });
  }

  // Otherwise get the company default (no spokesperson_id)
  const { data, error } = await supabase
    .from("company_voice_profiles")
    .select("*")
    .eq("company_id", companyId)
    .is("spokesperson_id", null)
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
    spokespersonId,
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

  // Deactivate existing profiles for this scope (person or company default)
  if (spokespersonId) {
    await supabase
      .from("company_voice_profiles")
      .update({ is_active: false })
      .eq("company_id", companyId)
      .eq("spokesperson_id", spokespersonId);
  } else {
    await supabase
      .from("company_voice_profiles")
      .update({ is_active: false })
      .eq("company_id", companyId)
      .is("spokesperson_id", null);
  }

  // Create new active profile
  const { data, error } = await supabase
    .from("company_voice_profiles")
    .insert({
      company_id: companyId,
      spokesperson_id: spokespersonId || null,
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

  // If this is for a spokesperson, link the voice profile to them
  if (spokespersonId && data) {
    await supabase
      .from("company_spokespersons")
      .update({ voice_profile_id: data.id })
      .eq("id", spokespersonId);
  }

  return NextResponse.json({ data });
}
