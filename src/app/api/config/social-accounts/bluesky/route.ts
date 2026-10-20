import { NextResponse } from "next/server";
import { requireCompanyUser } from "@/lib/supabase/admin";
import { connectBlueskyAccount } from "@/lib/bluesky/connect";

/** Connects a company Bluesky account with an app password and saves its renewable session tokens. */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { companyId?: string; handle?: string; appPassword?: string } | null;
  if (!body?.companyId || !body.handle || !body.appPassword) return NextResponse.json({ error: "companyId, handle and appPassword are required." }, { status: 400 });
  const profile = await requireCompanyUser(body.companyId);
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (profile.role !== "admin" && !profile.can_publish) return NextResponse.json({ error: "Your account cannot connect publishing accounts." }, { status: 403 });
  try {
    const result = await connectBlueskyAccount(body.companyId, body.handle, body.appPassword);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({ connected: true, accountName: result.handle, accountId: result.did, method: "app_password" });
  } catch {
    return NextResponse.json({ error: "Bluesky could not verify this handle and app password." }, { status: 400 });
  }
}
