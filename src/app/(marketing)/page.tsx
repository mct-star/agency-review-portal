import Link from "next/link";
import GoogleSignInButton from "@/components/marketing/GoogleSignInButton";

// Premium modules — the three USPs
const MODULES = [
  {
    tag: "Copy Engine",
    tagColor: "bg-violet-100 text-violet-700",
    title: "AI that writes like you, not like a robot",
    description:
      "Record a voice note, paste your LinkedIn, or upload writing samples. The platform learns your cadence, vocabulary, and signature devices. Every post sounds unmistakably like you.",
    features: [
      "Voice profile from audio, LinkedIn, or documents",
      "7 post types designed for B2B engagement",
      "Content intelligence: hook tension, healthcare gates, AI detection",
      "Sign-off and first comment automation",
      "Content calendar with strategic ecosystem linking",
    ],
    accentColor: "#7C3AED",
    icon: (
      <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
      </svg>
    ),
  },
  {
    tag: "Regulatory Review",
    tagColor: "bg-red-50 text-red-700",
    title: "Compliance review that catches what humans miss",
    description:
      "Three-colour MLR workflow maps every sentence to Legal, Regulatory, or Compliance responsibilities. Sentence-level analysis with regulation references and suggested compliant alternatives.",
    features: [
      "ABPI, MHRA, FDA, EU MDR frameworks",
      "Three-colour coding: Legal / Regulatory / Compliance",
      "Sentence-level flagging with suggested alternatives",
      "Professional numbered compliance reports",
      "Audit trail for every review",
      "10+ country market coverage",
    ],
    accentColor: "#DC2626",
    icon: (
      <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
      </svg>
    ),
  },
  {
    tag: "Creative AI",
    tagColor: "bg-amber-50 text-amber-700",
    title: "Premium visuals that stop the scroll",
    description:
      "From Pixar-quality 3D scenes to bold quote cards, every post gets an image that matches your brand. Upload a photo and the AI generates characters that look like your spokesperson.",
    features: [
      "Pixar/Disney-quality 3D character scenes",
      "Face-consistent generation from reference photos",
      "Programmatic quote cards (perfect text, every time)",
      "Editorial and lifestyle photography styles",
      "Carousel slide generation",
      "Branded overlay with logo, CTA, and profile picture",
    ],
    accentColor: "#D97706",
    icon: (
      <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z" />
      </svg>
    ),
  },
];

const PLATFORM_FEATURES = [
  {
    title: "One-Click Publishing",
    description: "Post directly to LinkedIn and Bluesky with images and first comments. Copy for X and Threads.",
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
      </svg>
    ),
  },
  {
    title: "Multi-Spokesperson",
    description: "Multiple voices, one brand. Each person gets their own content strategy, voice profile, and image style.",
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
      </svg>
    ),
  },
  {
    title: "Content Calendar",
    description: "Plan weeks and months. Each post connects to a strategic ecosystem with pillar and theme alignment.",
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
      </svg>
    ),
  },
  {
    title: "Voice Dictation",
    description: "Set up your brand voice by simply speaking. The AI captures your natural cadence and turns it into a voice profile.",
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
      </svg>
    ),
  },
];

const STEPS = [
  {
    number: "01",
    title: "Set up your brand",
    description: "Record a voice note, paste your LinkedIn URL, or fill in details. We extract your voice, audience, and differentiators in under a minute.",
  },
  {
    number: "02",
    title: "Choose your modules",
    description: "Start with the Copy Engine. Add Regulatory Review for compliance-heavy industries. Add Creative AI for premium visual assets.",
  },
  {
    number: "03",
    title: "Generate content",
    description: "AI creates posts in your voice with quality gates for healthcare specificity, hook tension, and brand consistency.",
  },
  {
    number: "04",
    title: "Review, approve, publish",
    description: "Compliance review flags issues before they become problems. One click to publish to LinkedIn with images and first comments.",
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
              Three AI modules that work together: a Copy Engine that writes like you,
              Regulatory Review that catches what humans miss, and Creative AI
              that makes every post stop the scroll.
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

            {/* Google sign-in shortcut */}
            <div className="mt-6 flex flex-col items-center gap-2">
              <div className="flex items-center gap-3">
                <div className="h-px w-12 bg-gray-200" />
                <span className="text-xs text-gray-400">or get started instantly</span>
                <div className="h-px w-12 bg-gray-200" />
              </div>
              <GoogleSignInButton />
            </div>
          </div>
        </div>
        <div className="absolute inset-x-0 top-0 -z-10 h-full overflow-hidden">
          <div className="absolute -top-40 left-1/2 -translate-x-1/2 h-[600px] w-[900px] rounded-full bg-violet-100/50 blur-3xl" />
        </div>
      </section>

      {/* Social proof */}
      <section className="border-y border-gray-100 bg-gray-50 py-6">
        <div className="mx-auto max-w-6xl px-6 text-center">
          <p className="text-sm text-gray-500">
            Built by <strong className="text-gray-700">AGENCY Bristol</strong> — a healthcare demand generation consultancy that
            built this for their own 10-week production workflow, then opened it up.
          </p>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════
          THREE PREMIUM MODULES — the core USPs
          ═══════════════════════════════════════════════════════ */}
      <section className="py-20 sm:py-28">
        <div className="mx-auto max-w-6xl px-6">
          <div className="mx-auto max-w-2xl text-center mb-16">
            <h2 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
              Three modules. One platform.
            </h2>
            <p className="mt-4 text-lg text-gray-600">
              Start with what you need. Add modules as you grow.
              Each one makes the others more powerful.
            </p>
          </div>

          <div className="space-y-12">
            {MODULES.map((mod, i) => (
              <div
                key={mod.tag}
                className="rounded-2xl border border-gray-200 bg-white overflow-hidden shadow-sm"
              >
                {/* Accent bar */}
                <div className="h-1" style={{ backgroundColor: mod.accentColor }} />
                <div className="p-8 lg:p-10">
                  <div className={`grid gap-8 ${i % 2 === 1 ? "lg:grid-cols-[1fr_1.2fr]" : "lg:grid-cols-[1.2fr_1fr]"}`}>
                    {/* Text side */}
                    <div className={i % 2 === 1 ? "lg:order-2" : ""}>
                      <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${mod.tagColor}`}>
                        {mod.tag}
                      </span>
                      <h3 className="mt-4 text-2xl font-bold text-gray-900">
                        {mod.title}
                      </h3>
                      <p className="mt-3 text-base text-gray-600">
                        {mod.description}
                      </p>
                    </div>

                    {/* Features side */}
                    <div className={i % 2 === 1 ? "lg:order-1" : ""}>
                      <ul className="space-y-3">
                        {mod.features.map((feature) => (
                          <li key={feature} className="flex items-start gap-3 text-sm text-gray-700">
                            <svg className="mt-0.5 h-4 w-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke={mod.accentColor} strokeWidth="2.5">
                              <path d="M5 13l4 4L19 7" />
                            </svg>
                            {feature}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Platform features (included in all plans) */}
      <section className="bg-gray-50 py-16">
        <div className="mx-auto max-w-6xl px-6">
          <h3 className="text-center text-sm font-semibold uppercase tracking-wider text-gray-400 mb-8">
            Included in every plan
          </h3>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {PLATFORM_FEATURES.map((feat) => (
              <div key={feat.title} className="flex items-start gap-3">
                <div className="rounded-lg bg-white p-2 text-gray-500 shadow-sm border border-gray-100">
                  {feat.icon}
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-900">{feat.title}</p>
                  <p className="mt-1 text-xs text-gray-500">{feat.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-20 sm:py-28">
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

      {/* ═══════════════════════════════════════════════════════
          PRICING — Module-based
          ═══════════════════════════════════════════════════════ */}
      <section className="bg-gray-50 py-20 sm:py-28">
        <div className="mx-auto max-w-6xl px-6">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
              Start free. Add what you need.
            </h2>
            <p className="mt-4 text-lg text-gray-600">
              Every plan includes the core platform. Premium modules unlock
              advanced capabilities.
            </p>
          </div>

          <div className="mt-16 grid gap-6 lg:grid-cols-3">
            {/* Starter */}
            <div className="rounded-xl border border-gray-200 bg-white p-8">
              <h3 className="text-lg font-semibold text-gray-900">Starter</h3>
              <p className="mt-1 text-sm text-gray-500">Get started with AI content</p>
              <p className="mt-6"><span className="text-4xl font-bold text-gray-900">$0</span><span className="text-sm text-gray-500">/month</span></p>
              <ul className="mt-8 space-y-3 text-sm text-gray-600">
                <li className="flex items-start gap-2"><span className="text-green-500 mt-0.5">&#10003;</span> 1 spokesperson</li>
                <li className="flex items-start gap-2"><span className="text-green-500 mt-0.5">&#10003;</span> 5 posts per month</li>
                <li className="flex items-start gap-2"><span className="text-green-500 mt-0.5">&#10003;</span> Copy Engine (basic)</li>
                <li className="flex items-start gap-2"><span className="text-green-500 mt-0.5">&#10003;</span> Quote card images</li>
                <li className="flex items-start gap-2"><span className="text-green-500 mt-0.5">&#10003;</span> Brand overlay</li>
                <li className="flex items-start gap-2"><span className="text-green-500 mt-0.5">&#10003;</span> LinkedIn publishing</li>
              </ul>
              <Link href="/signup" className="mt-8 block w-full rounded-lg border border-gray-300 py-2.5 text-center text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors">
                Get started free
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
                <li className="flex items-start gap-2"><span className="text-violet-500 mt-0.5 font-bold">+</span> <strong>Copy Engine</strong> (full voice profile, quality gates)</li>
                <li className="flex items-start gap-2"><span className="text-violet-500 mt-0.5 font-bold">+</span> <strong>Regulatory Review</strong> (ABPI, MHRA, FDA)</li>
                <li className="flex items-start gap-2"><span className="text-green-500 mt-0.5">&#10003;</span> Content calendar</li>
                <li className="flex items-start gap-2"><span className="text-green-500 mt-0.5">&#10003;</span> Voice dictation setup</li>
                <li className="flex items-start gap-2"><span className="text-green-500 mt-0.5">&#10003;</span> Multi-platform publishing</li>
              </ul>
              <Link href="/signup" className="mt-8 block w-full rounded-lg bg-violet-600 py-2.5 text-center text-sm font-semibold text-white hover:bg-violet-700 transition-colors">
                Start 7-day free trial
              </Link>
            </div>

            {/* Agency */}
            <div className="rounded-xl border border-gray-200 bg-white p-8">
              <h3 className="text-lg font-semibold text-gray-900">Agency</h3>
              <p className="mt-1 text-sm text-gray-500">Premium modules + multi-brand</p>
              <p className="mt-6"><span className="text-4xl font-bold text-gray-900">$299</span><span className="text-sm text-gray-500">/month</span></p>
              <ul className="mt-8 space-y-3 text-sm text-gray-600">
                <li className="flex items-start gap-2"><span className="text-green-500 mt-0.5">&#10003;</span> Everything in Pro</li>
                <li className="flex items-start gap-2"><span className="text-amber-500 mt-0.5 font-bold">+</span> <strong>Creative AI</strong> (Pixar 3D, face-match, carousels)</li>
                <li className="flex items-start gap-2"><span className="text-green-500 mt-0.5">&#10003;</span> Multi-company management</li>
                <li className="flex items-start gap-2"><span className="text-green-500 mt-0.5">&#10003;</span> White-label branding</li>
                <li className="flex items-start gap-2"><span className="text-green-500 mt-0.5">&#10003;</span> Full month batch generation</li>
                <li className="flex items-start gap-2"><span className="text-green-500 mt-0.5">&#10003;</span> Multi-market compliance (10+ countries)</li>
                <li className="flex items-start gap-2"><span className="text-green-500 mt-0.5">&#10003;</span> Priority support</li>
              </ul>
              <Link href="/signup" className="mt-8 block w-full rounded-lg border border-gray-300 py-2.5 text-center text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors">
                Start 7-day free trial
              </Link>
            </div>
          </div>

          <div className="mt-8 text-center">
            <p className="text-sm text-gray-500">
              All plans include a 7-day Pro trial. No credit card required.
            </p>
            <p className="mt-2 text-xs text-gray-400">
              Need Creative AI without the Agency plan? Add it to Pro for $49/month.
            </p>
          </div>
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
