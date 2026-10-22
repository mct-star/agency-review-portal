import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { VIEW_AS_COOKIE, verifyViewAs, viewAsSecret } from "@/lib/view-as";

export async function createServerSupabaseClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Called from a Server Component. Safe to ignore when the
            // middleware refreshes sessions.
          }
        },
      },
    }
  );
}

export async function getUser() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

/** Set on a profile while an admin is viewing the platform as a company. */
export interface ViewingAs {
  companyId: string;
  companyName: string;
}

/**
 * The real signed-in profile, with the company joined. Anything that must
 * know who is really acting uses this (or the helpers in admin.ts).
 */
export async function getRealProfile() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: profile } = await supabase
    .from("users")
    .select("*, company:companies(*)")
    .eq("id", user.id)
    .single();

  return profile;
}

/**
 * The profile the pages render for. Normally the real one. When an admin is
 * viewing as a company (a valid signed cookie), it is that company's view:
 * role client, that company, no publish right, and `viewing_as` set so the
 * layout can show the banner. Only an admin's session can be re-pointed.
 */
export async function getUserProfile() {
  const profile = await getRealProfile();
  if (!profile || profile.role !== "admin") return profile;

  const secret = viewAsSecret();
  if (!secret) return profile;
  const cookieStore = await cookies();
  const viewedId = await verifyViewAs(cookieStore.get(VIEW_AS_COOKIE)?.value, secret);
  if (!viewedId) return profile;

  const supabase = await createServerSupabaseClient();
  const { data: company } = await supabase.from("companies").select("*").eq("id", viewedId).maybeSingle();
  if (!company) return profile;

  return {
    ...profile,
    role: "client",
    company_id: company.id,
    company,
    can_publish: false,
    viewing_as: { companyId: company.id, companyName: company.name } as ViewingAs,
  };
}
