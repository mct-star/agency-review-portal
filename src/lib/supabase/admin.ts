import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Create a Supabase client using the SERVICE_ROLE key.
 * Bypasses RLS — use only in server-side API routes where
 * you have already verified the caller is an admin.
 */
export async function createAdminSupabaseClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll() {},
      },
    }
  );
}

/**
 * Verify the caller is an authenticated admin user.
 * Returns the user profile row, or null if not authenticated/not admin.
 */
export async function requireAdmin() {
  const cookieStore = await cookies();

  // Use anon key to check the JWT-based auth
  const authClient = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll() {},
      },
    }
  );

  const {
    data: { user: authUser },
  } = await authClient.auth.getUser();
  if (!authUser) return null;

  // Use service role to fetch profile (bypasses RLS)
  const admin = await createAdminSupabaseClient();
  const { data: profile } = await admin
    .from("users")
    .select("*")
    .eq("id", authUser.id)
    .single();

  if (!profile || profile.role !== "admin") return null;

  return profile;
}
