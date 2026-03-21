import { NextResponse } from "next/server";
import { getUserProfile } from "@/lib/supabase/server";

/**
 * GET /api/me
 * Returns the authenticated user's profile (role, company_id, etc.).
 */
export async function GET() {
  const profile = await getUserProfile();
  if (!profile) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ data: profile });
}
