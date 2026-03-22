import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr"; // used in requireAdmin for cookie-based auth check
import { cookies } from "next/headers";

/**
 * Create a Supabase client using the SERVICE_ROLE key.
 * Uses @supabase/supabase-js directly so both the apikey header AND
 * the Authorization bearer token are the service role key — this
 * definitively bypasses RLS for all operations including Storage.
 *
 * Do NOT use @supabase/ssr's createServerClient here: when a user
 * session cookie is present it swaps in the user's JWT as the
 * Authorization header, which breaks RLS bypass for storage uploads.
 */
export async function createAdminSupabaseClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
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

/**
 * Verify the caller is an authenticated user who either:
 * - is an admin, OR
 * - belongs to the specified company (profile.company_id matches).
 *
 * Returns the user profile row, or null if not authorised.
 */
export async function requireCompanyUser(companyId: string) {
  const cookieStore = await cookies();

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

  if (!profile) return null;

  // Admin can access any company; company users can only access their own
  if (profile.role === "admin") return profile;
  if (profile.company_id === companyId) return profile;

  return null;
}
