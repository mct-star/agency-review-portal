import { NextResponse } from "next/server";
import { authoriseChannelManager } from "@/lib/auth/channel-manager";
import { connectBlueskyAccount } from "@/lib/bluesky/connect";

/** Connects a company Bluesky account with an app password and saves its renewable session tokens. */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { companyId?: string; handle?: string; appPassword?: string } | null;
  if (!body?.companyId || !body.handle || !body.appPassword) return NextResponse.json({ error: "companyId, handle and appPassword are required." }, { status: 400 });
  const auth = await authoriseChannelManager(body.companyId, { fence: true });
  if (!auth.ok) return auth.response;
  try {
    const result = await connectBlueskyAccount(body.companyId, body.handle, body.appPassword);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({ connected: true, accountName: result.handle, accountId: result.did, method: "app_password" });
  } catch {
    return NextResponse.json({ error: "Bluesky could not verify this handle and app password." }, { status: 400 });
  }
}
