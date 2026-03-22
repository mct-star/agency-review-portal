/**
 * Stripe configuration and client initialization.
 *
 * Environment variables required:
 * - STRIPE_SECRET_KEY: Server-side API key (sk_live_... or sk_test_...)
 * - NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: Client-side key (pk_live_... or pk_test_...)
 * - STRIPE_WEBHOOK_SECRET: Webhook endpoint signing secret (whsec_...)
 *
 * Price IDs are configured here rather than hardcoded in components,
 * so they can be changed when moving between test/live mode.
 */

import Stripe from "stripe";

// ============================================================
// Client
// ============================================================

let _stripeInstance: Stripe | null = null;

export function getStripe(): Stripe {
  if (_stripeInstance) return _stripeInstance;

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new Error("STRIPE_SECRET_KEY environment variable is not set");
  }

  _stripeInstance = new Stripe(secretKey, {
    apiVersion: "2025-02-24.acacia" as Stripe.LatestApiVersion,
    typescript: true,
  });

  return _stripeInstance;
}

// ============================================================
// Price mapping
// ============================================================

/**
 * Maps plan tiers to Stripe Price IDs.
 *
 * These should be set as environment variables so you can switch
 * between test and live mode without code changes.
 *
 * Create these in Stripe Dashboard:
 * - Product: "AGENCY Pro" → Price: $99/month recurring
 * - Product: "AGENCY Agency" → Price: $299/month recurring
 * - Product: "Creative AI Add-on" → Price: $49/month recurring
 */
export const STRIPE_PRICES = {
  pro: process.env.STRIPE_PRICE_PRO || "",
  agency: process.env.STRIPE_PRICE_AGENCY || "",
  creative_ai_addon: process.env.STRIPE_PRICE_CREATIVE_AI || "",
} as const;

/**
 * Maps Stripe Price IDs back to plan tiers.
 * Built dynamically from STRIPE_PRICES.
 */
export function getPlanFromPriceId(priceId: string): string | null {
  if (priceId === STRIPE_PRICES.pro) return "pro";
  if (priceId === STRIPE_PRICES.agency) return "agency";
  if (priceId === STRIPE_PRICES.creative_ai_addon) return "creative_ai_addon";
  return null;
}

// ============================================================
// URL helpers
// ============================================================

export function getBaseUrl(): string {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}
