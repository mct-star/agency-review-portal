"use client";

import { useState } from "react";

interface UpgradeButtonProps {
  plan: "starter" | "pro" | "agency";
  companyId: string;
  addons?: string[];
  className?: string;
  children: React.ReactNode;
}

/**
 * Upgrade button that initiates Stripe Checkout.
 *
 * When clicked:
 * 1. Calls POST /api/stripe/checkout with plan + companyId
 * 2. Stripe returns a Checkout Session URL
 * 3. Redirects the user to Stripe's hosted checkout page
 * 4. After payment, Stripe redirects back to /dashboard?checkout=success
 * 5. Webhook fires and updates the company's plan in Supabase
 */
export default function UpgradeButton({
  plan,
  companyId,
  addons,
  className = "",
  children,
}: UpgradeButtonProps) {
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    setLoading(true);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan, companyId, addons }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "Failed to start checkout");
        return;
      }
      // Redirect to Stripe Checkout
      if (data.url) {
        window.location.href = data.url;
      }
    } catch (err) {
      alert("Something went wrong. Please try again.");
      console.error("[UpgradeButton]", err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className={`${className} ${loading ? "opacity-60 cursor-wait" : ""}`}
    >
      {loading ? (
        <span className="flex items-center justify-center gap-2">
          <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Redirecting to checkout...
        </span>
      ) : (
        children
      )}
    </button>
  );
}
