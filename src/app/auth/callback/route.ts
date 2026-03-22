import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type");

  // Collect cookies that need to be set on the response
  const cookiesToReturn: { name: string; value: string; options?: Record<string, unknown> }[] = [];

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.headers
            .get("cookie")
            ?.split("; ")
            .map((c) => {
              const [name, ...rest] = c.split("=");
              return { name, value: rest.join("=") };
            }) ?? [];
        },
        setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
          cookiesToReturn.push(...cookiesToSet);
        },
      },
    }
  );

  let redirectUrl = `${origin}/login?error=missing_auth_params`;
  let authSuccess = false;

  // PKCE flow: exchange code for session
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      redirectUrl = `${origin}/dashboard`;
      authSuccess = true;
    } else {
      console.error("Auth callback error (code exchange):", error.message);
      redirectUrl = `${origin}/login?error=${encodeURIComponent(error.message)}`;
    }
  }

  // Token hash flow: verify OTP directly
  if (!code && token_hash && type) {
    const { error } = await supabase.auth.verifyOtp({
      token_hash,
      type: type as "magiclink" | "email",
    });
    if (!error) {
      redirectUrl = `${origin}/dashboard`;
      authSuccess = true;
    } else {
      console.error("Auth callback error (token verify):", error.message);
      redirectUrl = `${origin}/login?error=${encodeURIComponent(error.message)}`;
    }
  }

  // Auto-provision: if auth succeeded, check if this user needs a profile + company
  if (authSuccess) {
    try {
      const { data: { user: authUser } } = await supabase.auth.getUser();

      if (authUser) {
        // Use service role to bypass RLS for provisioning
        const adminSupabase = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!,
          { auth: { autoRefreshToken: false, persistSession: false } }
        );

        // Check if user profile exists
        const { data: existingProfile } = await adminSupabase
          .from("users")
          .select("id")
          .eq("id", authUser.id)
          .single();

        if (!existingProfile) {
          // New user — auto-provision from signup metadata
          const meta = authUser.user_metadata || {};
          const fullName = meta.full_name || meta.name || authUser.email?.split("@")[0] || "User";
          const companyName = meta.company_name;

          if (companyName) {
            // Create company with 7-day pro trial
            const slug = companyName
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, "-")
              .replace(/^-|-$/g, "")
              .slice(0, 50);

            const trialExpiresAt = new Date();
            trialExpiresAt.setDate(trialExpiresAt.getDate() + 7);

            const { data: newCompany } = await adminSupabase
              .from("companies")
              .insert({
                name: companyName,
                slug: `${slug}-${Date.now().toString(36)}`,
                plan: "starter",
                trial_plan: "pro",
                trial_started_at: new Date().toISOString(),
                trial_expires_at: trialExpiresAt.toISOString(),
                spokesperson_name: fullName,
              })
              .select("id")
              .single();

            if (newCompany) {
              // Create user profile linked to company
              await adminSupabase.from("users").insert({
                id: authUser.id,
                email: authUser.email!,
                full_name: fullName,
                role: "client",
                company_id: newCompany.id,
              });

              // Create primary spokesperson
              await adminSupabase.from("company_spokespersons").insert({
                company_id: newCompany.id,
                name: fullName,
                is_primary: true,
                is_active: true,
                sort_order: 0,
              });

              console.log(`[auth] Auto-provisioned company "${companyName}" + user "${fullName}" with 7-day pro trial`);

              // Fire signup webhook (Google Sheets, CRM, etc.)
              const webhookUrl = process.env.SIGNUP_WEBHOOK_URL;
              if (webhookUrl) {
                fetch(webhookUrl, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    event: "signup",
                    timestamp: new Date().toISOString(),
                    user: {
                      email: authUser.email,
                      name: fullName,
                      company: companyName,
                    },
                    trial: {
                      plan: "pro",
                      expires: trialExpiresAt.toISOString(),
                    },
                  }),
                }).catch(() => {/* non-critical */});
              }
            }
          } else {
            // No company name (existing login flow) — just create minimal profile
            // They'll see the "Almost there" screen asking admin to set them up
            // This preserves backwards compatibility with admin-provisioned users
          }
        }
      }
    } catch (provisionErr) {
      // Don't block auth on provisioning failure — user can still reach dashboard
      // and the "Almost there" screen will guide them
      console.error("[auth] Auto-provisioning failed:", provisionErr);
    }
  }

  // Create redirect response and attach ALL cookies from the auth exchange
  const response = NextResponse.redirect(redirectUrl);
  for (const { name, value, options } of cookiesToReturn) {
    response.cookies.set(name, value, options);
  }

  return response;
}
