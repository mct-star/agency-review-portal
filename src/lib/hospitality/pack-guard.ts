import { NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { NOT_FOR_VENUE } from "./b2b-only";

/**
 * For the old business-to-business batch routes (month fill, repurpose, the
 * strategy routes, the business Quick Post): a hospitality venue's own people
 * get a plain 403 that says what to use instead, never a half-run LinkedIn
 * job or a 500. Call it after the caller is authenticated and authorised for
 * the company. The operator (admin) is never refused, and a company whose
 * pack cannot be read is treated as a business-to-business one, which is how
 * every company behaved before the hospitality pack existed.
 */
export async function refuseHospitality(
  user: { role?: string | null },
  companyId: string | null | undefined
): Promise<NextResponse | null> {
  if (user.role === "admin" || !companyId) return null;
  const supabase = await createAdminSupabaseClient();
  const { data } = await supabase.from("companies").select("post_pack").eq("id", companyId).maybeSingle();
  if ((data as { post_pack?: string } | null)?.post_pack !== "hospitality") return null;
  return NextResponse.json({ error: NOT_FOR_VENUE.apiMessage, code: "not_in_your_pack" }, { status: 403 });
}
