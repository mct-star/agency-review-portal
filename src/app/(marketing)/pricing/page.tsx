import Link from "next/link";

const TIERS = [
  {
    name: "Free",
    price: "$0",
    description: "Get started and explore the platform",
    cta: "Get started",
    ctaStyle: "border border-gray-300 text-gray-700 hover:bg-gray-50",
    highlighted: false,
    features: [
      "1 spokesperson",
      "5 posts per month",
      "Basic content generation",
      "Brand overlay on images",
      "Download assets",
      "Community support",
    ],
  },
  {
    name: "Pro",
    price: "$99",
    description: "For teams serious about content at scale",
    cta: "Start 7-day free trial",
    ctaStyle: "bg-violet-600 text-white hover:bg-violet-700",
    highlighted: true,
    features: [
      "Unlimited spokespersons",
      "Unlimited content generation",
      "Regulatory compliance review (10 countries)",
      "LinkedIn direct publishing",
      "Content calendar planning",
      "Voice dictation brand setup",
      "Week ecosystem generation",
      "Post type variety (7 formats)",
      "First comment automation",
      "Priority email support",
    ],
  },
  {
    name: "Agency",
    price: "$299",
    description: "For agencies managing multiple client brands",
    cta: "Start 7-day free trial",
    ctaStyle: "border border-gray-300 text-gray-700 hover:bg-gray-50",
    highlighted: false,
    features: [
      "Everything in Pro",
      "Multi-company management",
      "White-label branding",
      "Full month generation",
      "Multi-market regulatory compliance",
      "Company blueprint auto-fill",
      "Client onboarding workflows",
      "Batch content generation",
      "Priority support with SLA",
    ],
  },
];

export default function PricingPage() {
  return (
    <>
      <section className="py-20 sm:py-28">
        <div className="mx-auto max-w-6xl px-6">
          <div className="mx-auto max-w-2xl text-center">
            <h1 className="text-4xl font-bold tracking-tight text-gray-900 sm:text-5xl">
              Simple, transparent pricing
            </h1>
            <p className="mt-4 text-lg text-gray-600">
              Start free, upgrade when you need more. Every plan includes a 7-day Pro trial.
            </p>
          </div>

          <div className="mt-16 grid gap-6 lg:grid-cols-3">
            {TIERS.map((tier) => (
              <div
                key={tier.name}
                className={`rounded-xl p-8 ${
                  tier.highlighted
                    ? "relative border-2 border-violet-600 bg-white shadow-lg"
                    : "border border-gray-200 bg-white"
                }`}
              >
                {tier.highlighted && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-violet-600 px-3 py-0.5 text-xs font-semibold text-white">
                    Most popular
                  </div>
                )}
                <h3 className="text-lg font-semibold text-gray-900">{tier.name}</h3>
                <p className="mt-1 text-sm text-gray-500">{tier.description}</p>
                <p className="mt-6">
                  <span className="text-4xl font-bold text-gray-900">{tier.price}</span>
                  <span className="text-sm text-gray-500">/month</span>
                </p>

                <Link
                  href="/signup"
                  className={`mt-8 block w-full rounded-lg py-2.5 text-center text-sm font-semibold transition-colors ${tier.ctaStyle}`}
                >
                  {tier.cta}
                </Link>

                <ul className="mt-8 space-y-3">
                  {tier.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2 text-sm text-gray-600">
                      <span className="mt-0.5 text-green-500">&#10003;</span>
                      {feature}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <div className="mt-12 text-center">
            <p className="text-sm text-gray-500">
              All plans include a 7-day Pro trial. No credit card required.
              Cancel anytime.
            </p>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="border-t border-gray-200 bg-gray-50 py-20">
        <div className="mx-auto max-w-3xl px-6">
          <h2 className="text-2xl font-bold text-gray-900 text-center">Frequently asked questions</h2>

          <div className="mt-12 space-y-8">
            <div>
              <h3 className="text-sm font-semibold text-gray-900">What happens after the trial?</h3>
              <p className="mt-2 text-sm text-gray-600">
                After 7 days, your account moves to the Free plan. You keep all your content and settings.
                Pro features (compliance review, publishing, calendar) become locked until you upgrade.
              </p>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-gray-900">Do I need my own AI API keys?</h3>
              <p className="mt-2 text-sm text-gray-600">
                Yes. The platform uses your API keys for content and image generation (e.g. Anthropic Claude, OpenAI).
                This gives you full control over costs and means your data stays between you and the provider.
              </p>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-gray-900">What industries does this work for?</h3>
              <p className="mt-2 text-sm text-gray-600">
                The platform is built specifically for healthcare, pharma, medtech, and life sciences companies.
                The regulatory compliance module covers UK, EU, and US frameworks. B2B companies in other regulated
                industries can also benefit from the content generation and brand voice features.
              </p>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-gray-900">Can I use this for multiple brands?</h3>
              <p className="mt-2 text-sm text-gray-600">
                Yes, the Agency plan supports multiple companies under one account. Each company gets its own
                brand voice, content strategy, and spokesperson configuration.
              </p>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-gray-900">What social platforms are supported?</h3>
              <p className="mt-2 text-sm text-gray-600">
                LinkedIn direct publishing is live now (including image upload and first comments).
                Content can be generated for LinkedIn, X, Bluesky, Threads, Facebook, Instagram, and TikTok.
                Direct publishing for additional platforms is on the roadmap.
              </p>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
