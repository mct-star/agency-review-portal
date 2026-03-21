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
    .from("company_spokespersons")
    .select("*")
    .eq("company_id", companyId)
    .eq("is_active", true)
    .order("sort_order");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data || [] });
}

export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { companyId, name, tagline, linkedinUrl, isPrimary, profilePictureUrl } = body;
  if (!companyId || !name) return NextResponse.json({ error: "companyId and name required" }, { status: 400 });

  const supabase = await createAdminSupabaseClient();

  // If setting as primary, unset other primaries
  if (isPrimary) {
    await supabase
      .from("company_spokespersons")
      .update({ is_primary: false })
      .eq("company_id", companyId);
  }

  // Auto-enrich from LinkedIn if URL provided but no photo
  let resolvedPhoto = profilePictureUrl || null;
  if (linkedinUrl && !resolvedPhoto) {
    try {
      const apiKey = process.env.PROXYCURL_API_KEY;
      if (apiKey) {
        let url = linkedinUrl.trim();
        if (!url.startsWith("http")) url = `https://${url}`;
        const res = await fetch(
          `https://nubela.co/proxycurl/api/v2/linkedin?url=${encodeURIComponent(url)}&use_cache=if-present`,
          { headers: { Authorization: `Bearer ${apiKey}` } }
        );
        if (res.ok) {
          const data = await res.json();
          if (data.profile_pic_url) resolvedPhoto = data.profile_pic_url;
        }
      }
    } catch {
      // Non-critical — continue without photo
    }
  }

  const { data, error } = await supabase
    .from("company_spokespersons")
    .insert({
      company_id: companyId,
      name,
      tagline: tagline || null,
      linkedin_url: linkedinUrl || null,
      profile_picture_url: resolvedPhoto,
      is_primary: isPrimary || false,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function PUT(request: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { id, name, tagline, linkedinUrl, isPrimary, profilePictureUrl } = body;
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const supabase = await createAdminSupabaseClient();

  const update: Record<string, unknown> = {};
  if (name !== undefined) update.name = name;
  if (tagline !== undefined) update.tagline = tagline;
  if (linkedinUrl !== undefined) update.linkedin_url = linkedinUrl;
  if (profilePictureUrl !== undefined) update.profile_picture_url = profilePictureUrl;
  if (isPrimary !== undefined) {
    update.is_primary = isPrimary;
    // Unset other primaries
    if (isPrimary) {
      const { data: person } = await supabase.from("company_spokespersons").select("company_id").eq("id", id).single();
      if (person) {
        await supabase.from("company_spokespersons").update({ is_primary: false }).eq("company_id", person.company_id);
      }
    }
  }

  const { data, error } = await supabase
    .from("company_spokespersons")
    .update(update)
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function DELETE(request: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { id } = body;
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const supabase = await createAdminSupabaseClient();
  const { error } = await supabase.from("company_spokespersons").update({ is_active: false }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
