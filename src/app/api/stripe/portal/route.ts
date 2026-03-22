import { NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { getStripe, getBaseUrl } from "@/lib/stripe/config";
import { getUser } from "@/lib/supabase/server";

/**
 * POST /api/stripe/portal
 *
 * Creates a Stripe Customer Portal session so users can:
 * - Update their payment method
 * - View invoices
 * - Change or cancel their subscription
 * - Add/remove add-ons
 *
 * Body: { companyId: string }
 */
export async function POST(request: Request) {
  const body = await request.json();
  const { companyId } = body;

  if (!companyId) {
    return NextResponse.json({ error: "companyId is required" }, { status: 400 });
  }

  // Auth check
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Get company's Stripe customer ID
  const adminSupabase = await createAdminSupabaseClient();
  const { data: company } = await adminSupabase
    .from("companies")
    .select("stripe_customer_id")
    .eq("id", companyId)
    .single();

  if (!company?.stripe_customer_id) {
    return NextResponse.json(
      { error: "No billing account found. Subscribe to a plan first." },
      { status: 404 }
    );
  }

  const stripe = getStripe();
  const baseUrl = getBaseUrl();

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: company.stripe_customer_id,
      return_url: `${baseUrl}/setup`,
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("[stripe/portal] Session creation failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Portal session creation failed" },
      { status: 500 }
    );
  }
}
