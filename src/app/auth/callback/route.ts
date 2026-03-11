import { createServerClient } from "@supabase/ssr";
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

  // PKCE flow: exchange code for session
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      redirectUrl = `${origin}/dashboard`;
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
    } else {
      console.error("Auth callback error (token verify):", error.message);
      redirectUrl = `${origin}/login?error=${encodeURIComponent(error.message)}`;
    }
  }

  // Create redirect response and attach ALL cookies from the auth exchange
  const response = NextResponse.redirect(redirectUrl);
  for (const { name, value, options } of cookiesToReturn) {
    response.cookies.set(name, value, options);
  }

  return response;
}
