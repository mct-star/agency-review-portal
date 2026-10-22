import { NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { authoriseBankItem } from "@/lib/media/access";
import { CAPTURES_BUCKET } from "@/lib/upload/media-constants";

/**
 * GET /api/bank/[id]/original
 *
 * A one-hour signed URL for the full-size original. The grid never calls
 * this; it is for the moment someone chooses to view the full photo or play
 * the clip.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await authoriseBankItem<{ company_id: string; bucket: string | null; storage_path: string | null }>(
    id,
    "id, company_id, bucket, storage_path"
  );
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  const { item } = access;
  if (item.bucket !== CAPTURES_BUCKET || !item.storage_path) {
    return NextResponse.json({ error: "The original file is missing" }, { status: 409 });
  }
  const supabase = await createAdminSupabaseClient();
  const { data, error } = await supabase.storage.from(CAPTURES_BUCKET).createSignedUrl(item.storage_path, 3600);
  if (error || !data) return NextResponse.json({ error: "Could not open the file" }, { status: 500 });
  return NextResponse.json({ url: data.signedUrl });
}
