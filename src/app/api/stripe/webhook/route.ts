import { NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe/config";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import Stripe from "stripe";

/**
 * POST /api/stripe/webhook
 *
 * Stripe webhook handler. Processes subscription lifecycle events
 * and updates the company's plan in Supabase.
 *
 * Events handled:
 * - checkout.session.completed — initial subscription created
 * - customer.subscription.updated — plan changed, trial ended, renewed
 * - customer.subscription.deleted — subscription cancelled
 * - invoice.payment_failed — payment failed (flag for follow-up)
 *
 * Webhook must be configured in Stripe Dashboard:
 * URL: https://agency-review-portal.vercel.app/api/stripe/webhook
 * Events: checkout.session.completed, customer.subscription.*,
 *         invoice.payment_failed
 */
export async function POST(request: Request) {
  const body = await request.text();
  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json({ error: "Missing stripe-signature header" }, { status: 400 });
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error("[stripe/webhook] STRIPE_WEBHOOK_SECRET not set");
    return NextResponse.json({ error: "Webhook secret not configured" }, { status: 500 });
  }

  const stripe = getStripe();
  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err) {
    console.error("[stripe/webhook] Signature verification failed:", err);
    return NextResponse.json(
      { error: `Webhook signature verification failed: ${err instanceof Error ? err.message : "unknown"}` },
      { status: 400 }
    );
  }

  const supabase = await createAdminSupabaseClient();

  try {
    switch (event.type) {
      // ── Checkout completed (new subscription) ──────────
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const companyId = session.metadata?.company_id;
        const plan = session.metadata?.plan;

        if (companyId && plan) {
          await supabase
            .from("companies")
            .update({
              plan: plan,
              stripe_customer_id: session.customer as string,
              stripe_subscription_id: session.subscription as string,
              plan_updated_at: new Date().toISOString(),
            })
            .eq("id", companyId);

          console.log(`[stripe/webhook] Company ${companyId} upgraded to ${plan}`);
        }
        break;
      }

      // ── Subscription updated (plan change, renewal, trial end) ──
      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        const companyId = subscription.metadata?.company_id;

        if (companyId) {
          // Determine plan from the subscription's price
          const priceId = subscription.items.data[0]?.price?.id;
          let plan = "free";

          if (priceId === process.env.STRIPE_PRICE_AGENCY) {
            plan = "agency";
          } else if (priceId === process.env.STRIPE_PRICE_PRO) {
            plan = "pro";
          }

          // Check for active add-ons
          const hasCreativeAi = subscription.items.data.some(
            (item) => item.price.id === process.env.STRIPE_PRICE_CREATIVE_AI
          );

          const updateData: Record<string, unknown> = {
            plan,
            plan_updated_at: new Date().toISOString(),
          };

          // If subscription is past_due or cancelled, handle gracefully
          if (subscription.status === "past_due") {
            updateData.plan_status = "past_due";
          } else if (subscription.status === "active") {
            updateData.plan_status = "active";
          }

          // Track add-ons
          if (hasCreativeAi) {
            updateData.has_creative_ai_addon = true;
          }

          await supabase
            .from("companies")
            .update(updateData)
            .eq("id", companyId);

          console.log(`[stripe/webhook] Company ${companyId} subscription updated: ${plan} (status: ${subscription.status})`);
        }
        break;
      }

      // ── Subscription deleted (cancelled) ──────────────
      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const companyId = subscription.metadata?.company_id;

        if (companyId) {
          await supabase
            .from("companies")
            .update({
              plan: "free",
              plan_status: "cancelled",
              stripe_subscription_id: null,
              plan_updated_at: new Date().toISOString(),
              has_creative_ai_addon: false,
            })
            .eq("id", companyId);

          console.log(`[stripe/webhook] Company ${companyId} subscription cancelled, reverted to free`);
        }
        break;
      }

      // ── Invoice payment failed ─────────────────────────
      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = invoice.customer as string;

        // Find company by Stripe customer ID
        const { data: company } = await supabase
          .from("companies")
          .select("id")
          .eq("stripe_customer_id", customerId)
          .single();

        if (company) {
          await supabase
            .from("companies")
            .update({
              plan_status: "payment_failed",
              plan_updated_at: new Date().toISOString(),
            })
            .eq("id", company.id);

          console.log(`[stripe/webhook] Payment failed for company ${company.id}`);
        }
        break;
      }
    }
  } catch (err) {
    console.error("[stripe/webhook] Event processing failed:", err);
    // Return 200 anyway — Stripe will retry if we return non-2xx,
    // and retrying a broken handler makes things worse
    return NextResponse.json({ received: true, error: "Processing failed" });
  }

  return NextResponse.json({ received: true });
}
