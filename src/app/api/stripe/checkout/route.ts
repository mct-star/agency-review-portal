import { NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { getStripe, STRIPE_PRICES, getBaseUrl } from "@/lib/stripe/config";
import { getUser } from "@/lib/supabase/server";

/**
 * POST /api/stripe/checkout
 *
 * Creates a Stripe Checkout session for upgrading to Pro or Agency.
 * The user must be authenticated. We pass their company ID as metadata
 * so the webhook can update the correct company record.
 *
 * Body: {
 *   plan: "pro" | "agency",
 *   companyId: string,
 *   addons?: string[],  // e.g. ["creative_ai_addon"]
 * }
 */
export async function POST(request: Request) {
  const body = await request.json();
  const { plan, companyId, addons } = body;

  if (!plan || !companyId) {
    return NextResponse.json(
      { error: "plan and companyId are required" },
      { status: 400 }
    );
  }

  // Auth check
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Verify user belongs to company
  const adminSupabase = await createAdminSupabaseClient();
  const { data: membership } = await adminSupabase
    .from("company_members")
    .select("role")
    .eq("user_id", user.id)
    .eq("company_id", companyId)
    .single();

  if (!membership) {
    return NextResponse.json({ error: "Not a member of this company" }, { status: 403 });
  }

  // Get company for Stripe customer lookup/creation
  const { data: company } = await adminSupabase
    .from("companies")
    .select("id, name, stripe_customer_id")
    .eq("id", companyId)
    .single();

  if (!company) {
    return NextResponse.json({ error: "Company not found" }, { status: 404 });
  }

  const stripe = getStripe();
  const baseUrl = getBaseUrl();

  // Get or create Stripe customer
  let customerId = company.stripe_customer_id;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email || undefined,
      name: company.name,
      metadata: {
        company_id: companyId,
        supabase_user_id: user.id,
      },
    });
    customerId = customer.id;

    // Save Stripe customer ID
    await adminSupabase
      .from("companies")
      .update({ stripe_customer_id: customerId })
      .eq("id", companyId);
  }

  // Build line items
  const priceId = plan === "agency" ? STRIPE_PRICES.agency : STRIPE_PRICES.pro;
  if (!priceId) {
    return NextResponse.json(
      { error: `No Stripe Price ID configured for plan: ${plan}. Set STRIPE_PRICE_${plan.toUpperCase()} env var.` },
      { status: 500 }
    );
  }

  const lineItems: { price: string; quantity: number }[] = [
    { price: priceId, quantity: 1 },
  ];

  // Add-ons
  if (addons && Array.isArray(addons)) {
    for (const addon of addons) {
      const addonPrice = STRIPE_PRICES[addon as keyof typeof STRIPE_PRICES];
      if (addonPrice) {
        lineItems.push({ price: addonPrice, quantity: 1 });
      }
    }
  }

  try {
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: lineItems,
      success_url: `${baseUrl}/dashboard?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/pricing?checkout=cancelled`,
      allow_promotion_codes: true,
      billing_address_collection: "required",
      subscription_data: {
        metadata: {
          company_id: companyId,
          plan,
        },
        trial_period_days: 7,
      },
      metadata: {
        company_id: companyId,
        plan,
      },
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("[stripe/checkout] Session creation failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Checkout session creation failed" },
      { status: 500 }
    );
  }
}
