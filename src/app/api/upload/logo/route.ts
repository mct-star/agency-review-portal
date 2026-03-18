import { NextResponse } from "next/server";
import { requireAdmin, createAdminSupabaseClient } from "@/lib/supabase/admin";

/**
 * POST /api/upload/logo
 *
 * Uploads a company logo (PNG, SVG, JPG) to Supabase Storage
 * and updates the company's logo_url field.
 *
 * Accepts multipart/form-data with:
 * - file: the logo image
 * - companyId: string
 */
export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  const companyId = formData.get("companyId") as string | null;

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
  const storagePath = `logos/${companyId}/logo.${ext}`;

  const arrayBuffer = await file.arrayBuffer();

  // Upload (upsert to overwrite existing logo)
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

  // Update company record
  await supabase
    .from("companies")
    .update({ logo_url: publicUrl })
    .eq("id", companyId);

  return NextResponse.json({ url: publicUrl, storagePath });
}
