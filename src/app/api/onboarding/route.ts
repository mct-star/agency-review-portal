import { NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";

/**
 * POST /api/onboarding
 *
 * Self-service company creation for new users during onboarding.
 * Unlike /api/setup/quick (admin-only), this lets any authenticated
 * user create their own company and spokesperson.
 *
 * Body: {
 *   companyName: string,
 *   websiteUrl?: string,
 *   spokespersonName?: string,
 *   linkedinUrl?: string,
 * }
 */
export async function POST(request: Request) {
  // Auth: any logged-in user (not admin-only)
  const userSupabase = await createServerSupabaseClient();
  const { data: { user } } = await userSupabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await request.json();
  const { companyName, websiteUrl, spokespersonName, linkedinUrl, industry } = body;

  if (!companyName?.trim()) {
    return NextResponse.json({ error: "companyName is required" }, { status: 400 });
  }

  const supabase = await createAdminSupabaseClient();

  // Check if user already has a company
  const { data: existingProfile } = await supabase
    .from("profiles")
    .select("company_id")
    .eq("id", user.id)
    .single();

  if (existingProfile?.company_id) {
    return NextResponse.json({
      id: existingProfile.company_id,
      message: "Company already exists",
    });
  }

  // Create company
  const { data: company, error: compErr } = await supabase
    .from("companies")
    .insert({
      name: companyName.trim(),
      website_url: websiteUrl?.trim() || null,
      industry: industry || null,
      plan: "starter",
      trial_started_at: new Date().toISOString(),
      trial_ends_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    })
    .select("id")
    .single();

  if (compErr || !company) {
    return NextResponse.json(
      { error: `Failed to create company: ${compErr?.message}` },
      { status: 500 }
    );
  }

  // Link user to company
  await supabase
    .from("profiles")
    .update({ company_id: company.id, role: "client" })
    .eq("id", user.id);

  // Create spokesperson if name provided
  let spokesperson = null;
  if (spokespersonName?.trim()) {
    const { data: spok } = await supabase
      .from("company_spokespersons")
      .insert({
        company_id: company.id,
        name: spokespersonName.trim(),
        linkedin_url: linkedinUrl?.trim() || null,
        is_primary: true,
        is_active: true,
      })
      .select("id")
      .single();
    spokesperson = spok;
  }

  // Send trial welcome email
  try {
    const { sendEmail, trialWelcomeEmailHtml } = await import("@/lib/email/resend");
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://agency-review-portal.vercel.app";
    await sendEmail({
      to: user.email!,
      subject: `Welcome to AGENCY — your ${7}-day Pro trial has started`,
      html: trialWelcomeEmailHtml({
        userName: spokespersonName?.trim() || user.email?.split("@")[0] || "there",
        companyName: companyName.trim(),
        dashboardUrl: `${baseUrl}/dashboard`,
        trialDays: 7,
      }),
    });
  } catch {
    console.warn("[onboarding] Welcome email failed (non-critical)");
  }

  // Send new signup to webhook (Google Sheets / CRM)
  const webhookUrl = process.env.SIGNUP_WEBHOOK_URL;
  if (webhookUrl) {
    try {
      await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event: "new_signup",
          timestamp: new Date().toISOString(),
          email: user.email,
          companyName: companyName.trim(),
          spokespersonName: spokespersonName?.trim() || null,
          linkedinUrl: linkedinUrl?.trim() || null,
          websiteUrl: websiteUrl?.trim() || null,
          companyId: company.id,
          plan: "starter",
          trialStarted: new Date().toISOString(),
          trialEnds: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        }),
      });
    } catch {
      // Webhook is non-critical — don't block signup
      console.warn("[onboarding] Webhook failed (non-critical)");
    }
  }

  return NextResponse.json({
    id: company.id,
    spokespersonId: spokesperson?.id || null,
  });
}
