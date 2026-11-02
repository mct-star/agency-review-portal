import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireAdmin, requireCompanyUser, createAdminSupabaseClient } from "@/lib/supabase/admin";

/**
 * POST /api/upload/logo
 *
 * Uploads a company logo or profile picture to Supabase Storage.
 *
 * Accepts multipart/form-data with:
 * - file: the image
 * - companyId: string
 * - type: "logo" | "profile_picture" | "person_photo" (default: "logo")
 * - spokespersonId: required for "person_photo"
 *
 * "person_photo" is one person's own photo: a company user may upload it, it
 * gets its own path, and only the primary person's photo reaches the company
 * record, which the brand overlays still read. Every other type stays admin-only.
 */
export async function POST(request: Request) {
  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  const companyId = formData.get("companyId") as string | null;
  const uploadType = (formData.get("type") as string) || "logo";

  const caller = uploadType === "person_photo" && companyId
    ? await requireCompanyUser(companyId)
    : await requireAdmin();
  if (!caller) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!file || !companyId) {
    return NextResponse.json({ error: "file and companyId required" }, { status: 400 });
  }

  const validTypes = ["image/png", "image/svg+xml", "image/jpeg", "image/webp"];
  if (!validTypes.includes(file.type)) {
    return NextResponse.json({ error: "Logo must be PNG, SVG, JPG, or WebP" }, { status: 400 });
  }

  if (file.size > 5 * 1024 * 1024) {
    return NextResponse.json({ error: "Logo must be under 5 MB" }, { status: 400 });
  }

  const supabase = await createAdminSupabaseClient();
  const ext = file.name.split(".").pop() || "png";

  // Reference photos for spokesperson likeness — stored per-person with index
  if (uploadType === "reference_photo") {
    const spokespersonId = formData.get("spokespersonId") as string;
    const index = formData.get("index") as string || "0";
    if (!spokespersonId) {
      return NextResponse.json({ error: "spokespersonId required for reference photos" }, { status: 400 });
    }
    const refPath = `reference-photos/${companyId}/${spokespersonId}/ref_${index}_${Date.now()}.${ext}`;
    const arrayBuffer = await file.arrayBuffer();
    const { error: uploadErr } = await supabase.storage
      .from("media")
      .upload(refPath, arrayBuffer, { contentType: file.type, upsert: false });

    if (uploadErr) {
      return NextResponse.json({ error: `Upload failed: ${uploadErr.message}` }, { status: 500 });
    }

    const { data: urlData } = supabase.storage.from("media").getPublicUrl(refPath);
    return NextResponse.json({ url: urlData.publicUrl, storagePath: refPath });
  }

  if (uploadType === "person_photo") {
    const spokespersonId = formData.get("spokespersonId") as string | null;
    if (!spokespersonId) {
      return NextResponse.json({ error: "spokespersonId required for a person's photo" }, { status: 400 });
    }
    const { data: person } = await supabase
      .from("company_spokespersons")
      .select("id, is_primary")
      .eq("id", spokespersonId)
      .eq("company_id", companyId)
      .maybeSingle();
    if (!person) {
      return NextResponse.json({ error: "Person not found" }, { status: 404 });
    }
    const personPath = `people/${companyId}/${spokespersonId}/profile_${Date.now()}.${ext}`;
    const { error: uploadErr } = await supabase.storage
      .from("media")
      .upload(personPath, await file.arrayBuffer(), { contentType: file.type, upsert: false });
    if (uploadErr) {
      return NextResponse.json({ error: `Upload failed: ${uploadErr.message}` }, { status: 500 });
    }
    const { data: urlData } = supabase.storage.from("media").getPublicUrl(personPath);
    if (person.is_primary) {
      const { error: dbErr } = await supabase
        .from("companies")
        .update({ profile_picture_url: urlData.publicUrl })
        .eq("id", companyId);
      if (dbErr) {
        return NextResponse.json({ error: `File uploaded but DB update failed: ${dbErr.message}` }, { status: 500 });
      }
    }
    return NextResponse.json({ url: urlData.publicUrl, storagePath: personPath });
  }

  const filenameMap: Record<string, string> = {
    logo: "logo",
    profile_picture: "profile",
    brand_mask: "brand_mask",
    overlay_logo: "overlay_logo",
  };
  const filenameBase = filenameMap[uploadType] || "logo";
  const storagePath = `logos/${companyId}/${filenameBase}.${ext}`;

  const arrayBuffer = await file.arrayBuffer();

  // Upload (upsert to overwrite existing file)
  const { error: uploadErr } = await supabase.storage
    .from("media")
    .upload(storagePath, arrayBuffer, {
      contentType: file.type,
      upsert: true,
    });

  if (uploadErr) {
    return NextResponse.json({ error: `Upload failed: ${uploadErr.message}` }, { status: 500 });
  }

  const { data: urlData } = supabase.storage.from("media").getPublicUrl(storagePath);
  const publicUrl = urlData.publicUrl;

  // Update company record with the new URL
  const fieldMap: Record<string, string> = {
    logo: "logo_url",
    profile_picture: "profile_picture_url",
    brand_mask: "brand_mask_url",
    overlay_logo: "overlay_logo_url",
  };
  const updateField = fieldMap[uploadType] || "logo_url";
  const { error: dbErr } = await supabase
    .from("companies")
    .update({ [updateField]: publicUrl })
    .eq("id", companyId);

  if (dbErr) {
    return NextResponse.json(
      { error: `File uploaded but DB update failed: ${dbErr.message}` },
      { status: 500 }
    );
  }

  // Revalidate layouts so the sidebar picks up the new logo
  revalidatePath("/", "layout");

  return NextResponse.json({ url: publicUrl, storagePath });
}
