import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Helper: create a redirect that preserves Supabase session cookies
  function redirectWithCookies(pathname: string) {
    const url = request.nextUrl.clone();
    url.pathname = pathname;
    const redirectResponse = NextResponse.redirect(url);

    // Copy all cookies from the Supabase response to the redirect response.
    // This is critical — getUser() may have refreshed the session tokens,
    // and those refreshed cookies live on supabaseResponse. Without copying
    // them, the next request arrives with stale/consumed tokens → redirect loop.
    // We pass the full cookie object to preserve httpOnly, secure, path, etc.
    supabaseResponse.cookies.getAll().forEach((cookie) => {
      redirectResponse.cookies.set(cookie);
    });

    return redirectResponse;
  }

  // Protected route prefixes — everything else is public (marketing pages, signup, etc.)
  const protectedPrefixes = [
    "/dashboard", "/setup", "/generate", "/review", "/compliance",
    "/calendar", "/publish", "/admin", "/users", "/content",
  ];
  const isProtectedRoute = protectedPrefixes.some((p) =>
    request.nextUrl.pathname.startsWith(p)
  );

  // If not logged in and trying to access protected routes, redirect to login
  if (!user && isProtectedRoute) {
    return redirectWithCookies("/login");
  }

  // If logged in and on login page, redirect to dashboard
  if (user && request.nextUrl.pathname === "/login") {
    return redirectWithCookies("/dashboard");
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
