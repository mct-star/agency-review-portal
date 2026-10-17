import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isB2bOnlyPage } from "@/lib/hospitality/b2b-only";
import { VIEW_AS_COOKIE, verifyViewAs, viewAsSecret } from "@/lib/view-as";

export async function middleware(request: NextRequest) {
  // The (app) layout cannot see the address it is rendering for, so it is
  // passed along as a request header.
  request.headers.set("x-pathname", request.nextUrl.pathname);

  let supabaseResponse = NextResponse.next({
    request,
  });

  // This static, public design preview contains illustrative content only.
  // It must also work in preview deployments without database credentials.
  if (request.nextUrl.pathname === "/landing-preview") {
    return supabaseResponse;
  }

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

  // getUser() can fail if Supabase env vars are misconfigured or tokens are corrupt.
  // Treat failures as "no user" so public pages are still reachable.
  let user = null;
  try {
    const { data } = await supabase.auth.getUser();
    user = data?.user ?? null;
  } catch {
    user = null;
  }

  // A redirect that preserves Supabase session cookies. getUser() may have
  // refreshed the tokens onto supabaseResponse; without copying them the next
  // request arrives with stale tokens and loops.
  function redirectWithCookies(pathname: string) {
    const url = request.nextUrl.clone();
    url.pathname = pathname;
    url.search = "";
    const redirectResponse = NextResponse.redirect(url);
    supabaseResponse.cookies.getAll().forEach((cookie) => {
      redirectResponse.cookies.set(cookie);
    });
    return redirectResponse;
  }

  const pathname = request.nextUrl.pathname;

  // Public strategy share pages (a long token; the interview and competitor
  // pages are protected below).
  if (/^\/strategy\/[A-Za-z0-9_-]{12,}$/.test(pathname) && !/^\/strategy\/(interview|competitor)$/.test(pathname)) {
    return supabaseResponse;
  }

  const protectedPrefixes = [
    "/home", "/dashboard", "/setup", "/generate", "/review", "/compliance",
    "/calendar", "/publish", "/admin", "/users", "/content", "/create", "/plan",
    "/strategy", "/settings", "/analytics", "/library", "/approvals", "/not-available",
    "/notifications",
  ];
  const isProtectedRoute = protectedPrefixes.some((p) => pathname.startsWith(p));

  if (!user && isProtectedRoute) {
    return redirectWithCookies("/login");
  }

  // Home is /home for everyone.
  if (user && (pathname === "/" || pathname === "/login" || pathname === "/dashboard")) {
    return redirectWithCookies("/home");
  }

  // The hospitality fence, at the edge: a venue's people never reach a
  // business-to-business page, whether they typed the address or tapped a
  // link. A layout cannot do this on its own, because a shared layout does
  // not re-run on in-app navigation. Admins pass, unless they are viewing as
  // a venue, in which case they see the fence too.
  if (user && isProtectedRoute && isB2bOnlyPage(pathname)) {
    const { data: me } = await supabase.from("users").select("role, company_id").eq("id", user.id).maybeSingle();
    let companyId: string | null = (me?.company_id as string | null) ?? null;
    if (me?.role === "admin") {
      companyId = await verifyViewAs(request.cookies.get(VIEW_AS_COOKIE)?.value, viewAsSecret());
    }
    if (companyId) {
      const { data: company } = await supabase.from("companies").select("post_pack").eq("id", companyId).maybeSingle();
      if ((company as { post_pack?: string } | null)?.post_pack === "hospitality") {
        return redirectWithCookies("/not-available");
      }
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
