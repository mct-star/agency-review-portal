import { NextResponse } from "next/server";
import { createAdminSupabaseClient, getSignedInProfile } from "@/lib/supabase/admin";
import { planInvite, buildSignInUrl } from "@/lib/company/invite";
import { inviteEmail } from "@/lib/email/invite-email";
import { sendEmail } from "@/lib/email/resend";

/**
 * POST /api/company/invite
 *
 * Body: { email, fullName?, companyId?, canPublish? }
 *
 * Adds a person to a company and emails them a one-time sign-in link.
 * An admin can invite into any company; a company member can invite
 * colleagues into their own. Only an admin can grant the publish right.
 *
 * The account is created through Supabase Auth first (the users table
 * row has the auth id as its primary key, so the row cannot exist
 * before the account). The email is sent by us rather than by Supabase,
 * so it does not depend on Supabase's own mail settings, and the link
 * goes straight to /auth/callback with the hashed token.
 *
 * Returns { ok, emailSent, signInUrl? }. signInUrl is returned only to
 * an admin and only when the email could not be sent, so it can be
 * passed on by hand.
 */
export async function POST(request: Request) {
  const caller = await getSignedInProfile();
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const input = await request.json().catch(() => ({}));
  const supabase = await createAdminSupabaseClient();

  const emailForLookup = typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
  const { data: existing } = emailForLookup
    ? await supabase
        .from("users")
        .select("id, role, company_id")
        .eq("email", emailForLookup)
        .maybeSingle()
    : { data: null };

  const plan = planInvite(caller, input, existing ?? null);
  if (!plan.ok) return NextResponse.json({ error: plan.error }, { status: plan.status });

  const { data: company } = await supabase
    .from("companies")
    .select("id, name")
    .eq("id", plan.companyId)
    .maybeSingle();
  if (!company) return NextResponse.json({ error: "Company not found" }, { status: 404 });

  const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || "https://agency-review-portal.vercel.app").replace(/\/+$/, "");

  // New account: an invite link creates it. Existing account: a magic link.
  let linkType: "invite" | "magiclink" = existing ? "magiclink" : "invite";
  let link = await supabase.auth.admin.generateLink({
    type: linkType,
    email: plan.email,
    options: { data: { full_name: plan.fullName ?? undefined }, redirectTo: `${baseUrl}/auth/callback` },
  });
  if (link.error && linkType === "invite") {
    // The auth account exists even though no profile row did.
    linkType = "magiclink";
    link = await supabase.auth.admin.generateLink({
      type: "magiclink",
      email: plan.email,
      options: { redirectTo: `${baseUrl}/auth/callback` },
    });
  }
  if (link.error || !link.data?.user || !link.data.properties?.hashed_token) {
    return NextResponse.json(
      { error: `Could not create the sign-in link: ${link.error?.message ?? "no link returned"}` },
      { status: 500 }
    );
  }

  const authUser = link.data.user;
  const row: Record<string, unknown> = {
    id: authUser.id,
    email: plan.email,
    role: "client",
    company_id: plan.companyId,
  };
  if (plan.fullName) row.full_name = plan.fullName;
  if (plan.canPublish) row.can_publish = true;
  const { error: upsertError } = await supabase.from("users").upsert(row, { onConflict: "id" });
  if (upsertError) {
    return NextResponse.json({ error: `Could not save the person: ${upsertError.message}` }, { status: 500 });
  }

  const signInUrl = buildSignInUrl(baseUrl, link.data.properties.hashed_token, linkType);
  const mail = inviteEmail({
    userName: plan.fullName || plan.email.split("@")[0],
    companyName: company.name,
    signInUrl,
    loginUrl: `${baseUrl}/login`,
    invitedBy: (caller.full_name as string | null) || null,
  });
  const sent = await sendEmail({ to: plan.email, subject: mail.subject, html: mail.html });

  return NextResponse.json({
    ok: true,
    emailSent: sent.success,
    emailError: sent.success ? undefined : sent.error,
    ...(!sent.success && caller.role === "admin" ? { signInUrl } : {}),
  });
}
