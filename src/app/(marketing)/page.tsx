import Link from "next/link";

// Feature cards data
const FEATURES = [
  {
    title: "AI Content Generation",
    description: "From strategy to social posts, blog articles, and PDF guides. Your voice, not generic AI.",
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
      </svg>
    ),
  },
  {
    title: "Regulatory Compliance",
    description: "ABPI, MHRA, FDA checks built in. Flag issues before they become problems. 10 countries covered.",
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
      </svg>
    ),
  },
  {
    title: "Brand Voice Consistency",
    description: "Record your voice, import from LinkedIn, or define manually. Every post sounds like you.",
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
      </svg>
    ),
  },
  {
    title: "One-Click Publishing",
    description: "Post directly to LinkedIn with images and first comments. More platforms coming soon.",
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
      </svg>
    ),
  },
  {
    title: "Content Calendar",
    description: "Plan weeks and months of content. Each post connects to a strategic ecosystem.",
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
      </svg>
    ),
  },
  {
    title: "Multi-Spokesperson",
    description: "Multiple voices, one brand. Each person gets their own content strategy and style.",
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
      </svg>
    ),
  },
];

const STEPS = [
  {
    number: "01",
    title: "Set up your brand",
    description: "Record a voice note describing your business, paste your LinkedIn URL, or fill in details manually. We extract your voice, audience, and differentiators in under a minute.",
  },
  {
    number: "02",
    title: "Generate content",
    description: "AI creates social posts, blog articles, and PDF guides in your voice. Choose from 7 post types designed for B2B healthcare engagement.",
  },
  {
    number: "03",
    title: "Review and comply",
    description: "Built-in regulatory checks flag issues against ABPI, MHRA, and FDA guidelines. Sentence-level analysis with suggested compliant alternatives.",
  },
  {
    number: "04",
    title: "Publish everywhere",
    description: "Post directly to LinkedIn with branded images and first comments. Download assets for other platforms. Track what works.",
  },
];

export default function HomePage() {
  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="mx-auto max-w-6xl px-6 py-24 sm:py-32 lg:py-40">
          <div className="mx-auto max-w-3xl text-center">
            <p className="mb-4 inline-block rounded-full bg-violet-100 px-4 py-1.5 text-xs font-semibold text-violet-700">
              7-day free trial. No credit card required.
            </p>
            <h1 className="text-4xl font-bold tracking-tight text-gray-900 sm:text-5xl lg:text-6xl">
              Healthcare content that takes{" "}
              <span className="text-violet-600">minutes, not weeks</span>
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg text-gray-600">
              AI-powered content generation with built-in regulatory compliance.
              From strategy to published post in your voice, not generic AI.
              Built for healthcare and life sciences companies.
            </p>
            <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
              <Link
                href="/signup"
                className="w-full rounded-lg bg-violet-600 px-8 py-3.5 text-sm font-semibold text-white shadow-sm hover:bg-violet-700 transition-colors sm:w-auto"
              >
                Start your free trial
              </Link>
              <Link
                href="/how-it-works"
                className="w-full rounded-lg border border-gray-300 px-8 py-3.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors sm:w-auto"
              >
                See how it works
              </Link>
            </div>
          </div>
        </div>
        {/* Gradient bg decoration */}
        <div className="absolute inset-x-0 top-0 -z-10 h-full overflow-hidden">
          <div className="absolute -top-40 left-1/2 -translate-x-1/2 h-[600px] w-[900px] rounded-full bg-violet-100/50 blur-3xl" />
        </div>
      </section>

      {/* Social proof line */}
      <section className="border-y border-gray-100 bg-gray-50 py-6">
        <div className="mx-auto max-w-6xl px-6 text-center">
          <p className="text-sm text-gray-500">
            Built by <strong className="text-gray-700">AGENCY Bristol</strong> — a healthcare demand generation consultancy that
            built this for their own 10-week production workflow, then opened it up.
          </p>
        </div>
      </section>

      {/* Features */}
      <section className="py-20 sm:py-28">
        <div className="mx-auto max-w-6xl px-6">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
              Everything you need to create compliant content at scale
            </h2>
            <p className="mt-4 text-lg text-gray-600">
              Stop wrestling with compliance reviews and generic AI outputs.
              Get content that sounds like you and passes regulatory checks first time.
            </p>
          </div>

          <div className="mt-16 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((feature) => (
              <div key={feature.title} className="rounded-xl border border-gray-200 bg-white p-6">
                <div className="mb-4 inline-flex rounded-lg bg-violet-50 p-2.5 text-violet-600">
                  {feature.icon}
                </div>
                <h3 className="text-base font-semibold text-gray-900">{feature.title}</h3>
                <p className="mt-2 text-sm text-gray-600">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works (summary) */}
      <section className="bg-gray-50 py-20 sm:py-28">
        <div className="mx-auto max-w-6xl px-6">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
              From zero to published in four steps
            </h2>
            <p className="mt-4 text-lg text-gray-600">
              Set up once, generate every week. Each post is strategically connected.
            </p>
          </div>

          <div className="mt-16 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((step) => (
              <div key={step.number} className="relative">
                <div className="mb-3 text-3xl font-bold text-violet-200">{step.number}</div>
                <h3 className="text-base font-semibold text-gray-900">{step.title}</h3>
                <p className="mt-2 text-sm text-gray-600">{step.description}</p>
              </div>
            ))}
          </div>

          <div className="mt-12 text-center">
            <Link
              href="/how-it-works"
              className="text-sm font-semibold text-violet-600 hover:text-violet-700"
            >
              Learn more about the process &rarr;
            </Link>
          </div>
        </div>
      </section>

      {/* Pricing preview */}
      <section className="py-20 sm:py-28">
        <div className="mx-auto max-w-6xl px-6">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
              Simple pricing, powerful results
            </h2>
            <p className="mt-4 text-lg text-gray-600">
              Start with a free trial. Upgrade when you are ready.
            </p>
          </div>

          <div className="mt-16 grid gap-6 lg:grid-cols-3">
            {/* Free */}
            <div className="rounded-xl border border-gray-200 bg-white p-8">
              <h3 className="text-lg font-semibold text-gray-900">Free</h3>
              <p className="mt-1 text-sm text-gray-500">Get started with the basics</p>
              <p className="mt-6"><span className="text-4xl font-bold text-gray-900">$0</span><span className="text-sm text-gray-500">/month</span></p>
              <ul className="mt-8 space-y-3 text-sm text-gray-600">
                <li className="flex items-start gap-2"><span className="text-green-500 mt-0.5">&#10003;</span> 1 spokesperson</li>
                <li className="flex items-start gap-2"><span className="text-green-500 mt-0.5">&#10003;</span> 5 posts per month</li>
                <li className="flex items-start gap-2"><span className="text-green-500 mt-0.5">&#10003;</span> Basic content generation</li>
                <li className="flex items-start gap-2"><span className="text-green-500 mt-0.5">&#10003;</span> Brand overlay</li>
              </ul>
              <Link href="/signup" className="mt-8 block w-full rounded-lg border border-gray-300 py-2.5 text-center text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors">
                Get started
              </Link>
            </div>

            {/* Pro (highlighted) */}
            <div className="relative rounded-xl border-2 border-violet-600 bg-white p-8">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-violet-600 px-3 py-0.5 text-xs font-semibold text-white">
                Most popular
              </div>
              <h3 className="text-lg font-semibold text-gray-900">Pro</h3>
              <p className="mt-1 text-sm text-gray-500">For teams serious about content</p>
              <p className="mt-6"><span className="text-4xl font-bold text-gray-900">$99</span><span className="text-sm text-gray-500">/month</span></p>
              <ul className="mt-8 space-y-3 text-sm text-gray-600">
                <li className="flex items-start gap-2"><span className="text-green-500 mt-0.5">&#10003;</span> Unlimited spokespersons</li>
                <li className="flex items-start gap-2"><span className="text-green-500 mt-0.5">&#10003;</span> Unlimited content generation</li>
                <li className="flex items-start gap-2"><span className="text-green-500 mt-0.5">&#10003;</span> Regulatory compliance review</li>
                <li className="flex items-start gap-2"><span className="text-green-500 mt-0.5">&#10003;</span> LinkedIn direct publishing</li>
                <li className="flex items-start gap-2"><span className="text-green-500 mt-0.5">&#10003;</span> Content calendar</li>
                <li className="flex items-start gap-2"><span className="text-green-500 mt-0.5">&#10003;</span> Voice dictation setup</li>
              </ul>
              <Link href="/signup" className="mt-8 block w-full rounded-lg bg-violet-600 py-2.5 text-center text-sm font-semibold text-white hover:bg-violet-700 transition-colors">
                Start 7-day free trial
              </Link>
            </div>

            {/* Agency */}
            <div className="rounded-xl border border-gray-200 bg-white p-8">
              <h3 className="text-lg font-semibold text-gray-900">Agency</h3>
              <p className="mt-1 text-sm text-gray-500">For agencies managing multiple brands</p>
              <p className="mt-6"><span className="text-4xl font-bold text-gray-900">$299</span><span className="text-sm text-gray-500">/month</span></p>
              <ul className="mt-8 space-y-3 text-sm text-gray-600">
                <li className="flex items-start gap-2"><span className="text-green-500 mt-0.5">&#10003;</span> Everything in Pro</li>
                <li className="flex items-start gap-2"><span className="text-green-500 mt-0.5">&#10003;</span> Multi-company management</li>
                <li className="flex items-start gap-2"><span className="text-green-500 mt-0.5">&#10003;</span> White-label branding</li>
                <li className="flex items-start gap-2"><span className="text-green-500 mt-0.5">&#10003;</span> Priority support</li>
                <li className="flex items-start gap-2"><span className="text-green-500 mt-0.5">&#10003;</span> Full month generation</li>
                <li className="flex items-start gap-2"><span className="text-green-500 mt-0.5">&#10003;</span> Multi-market compliance</li>
              </ul>
              <Link href="/signup" className="mt-8 block w-full rounded-lg border border-gray-300 py-2.5 text-center text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors">
                Start 7-day free trial
              </Link>
            </div>
          </div>

          <p className="mt-8 text-center text-sm text-gray-500">
            All plans include a 7-day Pro trial. No credit card required.
          </p>
        </div>
      </section>

      {/* Final CTA */}
      <section className="bg-violet-600 py-16 sm:py-20">
        <div className="mx-auto max-w-4xl px-6 text-center">
          <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
            Ready to transform your healthcare content?
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-lg text-violet-100">
            Start your free trial today. Set up in under 2 minutes.
            No credit card required.
          </p>
          <div className="mt-8">
            <Link
              href="/signup"
              className="inline-block rounded-lg bg-white px-8 py-3.5 text-sm font-semibold text-violet-600 shadow-sm hover:bg-violet-50 transition-colors"
            >
              Start your free trial
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
