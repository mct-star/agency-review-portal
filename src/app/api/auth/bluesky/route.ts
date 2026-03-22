import { NextResponse } from "next/server";
import { requireAdmin, createAdminSupabaseClient } from "@/lib/supabase/admin";
import { encrypt } from "@/lib/crypto";

/**
 * POST /api/auth/bluesky
 *
 * Connects a Bluesky account using handle + app password.
 * Bluesky uses the AT Protocol which supports app passwords
 * (no OAuth needed). We validate the credentials by creating
 * a session, then store the access/refresh tokens.
 *
 * Body: { companyId, spokespersonId?, handle, appPassword }
 */
export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { companyId, spokespersonId, handle, appPassword } = await request.json();

  if (!companyId || !handle || !appPassword) {
    return NextResponse.json(
      { error: "companyId, handle, and appPassword are required" },
      { status: 400 }
    );
  }

  // Normalize handle (add .bsky.social if no domain)
  const normalizedHandle = handle.includes(".") ? handle : `${handle}.bsky.social`;

  try {
    // Validate credentials by creating a session with Bluesky
    const sessionRes = await fetch("https://bsky.social/xrpc/com.atproto.server.createSession", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        identifier: normalizedHandle,
        password: appPassword,
      }),
    });

    if (!sessionRes.ok) {
      const errData = await sessionRes.json().catch(() => ({}));
      const message = errData.message || `Authentication failed (${sessionRes.status})`;
      return NextResponse.json({ error: message }, { status: 401 });
    }

    const session = await sessionRes.json();

    // Store the connection
    const supabase = await createAdminSupabaseClient();

    const row = {
      company_id: companyId,
      spokesperson_id: spokespersonId || null,
      platform: "bluesky" as const,
      account_name: session.handle || normalizedHandle,
      account_id: session.did,
      access_token_encrypted: encrypt(session.accessJwt),
      refresh_token_encrypted: session.refreshJwt ? encrypt(session.refreshJwt) : null,
      // Bluesky sessions expire but can be refreshed
      token_expires_at: null,
      platform_metadata: {
        did: session.did,
        handle: session.handle,
        email: session.email || null,
        // Store the app password encrypted for re-authentication
        app_password_encrypted: encrypt(appPassword),
      },
      is_active: true,
    };

    const { error: upsertErr } = await supabase
      .from("company_social_accounts")
      .upsert(row, {
        onConflict: "company_id,platform,account_id",
      });

    if (upsertErr) {
      console.error("Failed to store Bluesky account:", upsertErr);
      return NextResponse.json(
        { error: `Connection succeeded but storage failed: ${upsertErr.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      handle: session.handle,
      did: session.did,
    });
  } catch (err) {
    console.error("Bluesky auth error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Connection failed" },
      { status: 502 }
    );
  }
}
