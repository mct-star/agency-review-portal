import Link from "next/link";
import GoogleSignInButton from "@/components/marketing/GoogleSignInButton";
import PostShowcase from "@/components/marketing/PostShowcase";

// ─── Module data ─────────────────────────────────────────────────

const MODULES = [
  {
    tag: "Copy Engine",
    availability: "Included in every plan",
    tagColor: "bg-violet-100 text-violet-700",
    availColor: "text-violet-600",
    title: "A content engine built to project you.",
    description:
      "47,000 lines of code. 39 quality checks. Record a 60-second voice note and we learn your cadence, vocabulary, and energy. Every post passes through 39 quality gates to ensure it matches your tone of voice as closely as possible.",
    features: [
      "39 quality gates: hook tension, healthcare specificity, AI detection, brand consistency",
      "Voice profile from a 60-second recording, LinkedIn, or writing samples",
      "7 post types designed for B2B engagement and demand generation",
      "Scale from one post to a full month-long content ecosystem",
      "Sign-off and first comment automation",
    ],
    accentColor: "#7C3AED",
    gradient: "from-violet-600 to-purple-700",
  },
  {
    tag: "Creative AI",
    availability: "Included in every plan",
    tagColor: "bg-amber-50 text-amber-700",
    availColor: "text-amber-600",
    title: "Creative that stops the scroll.",
    description:
      "Pixar 3D, scene quotes, editorial photography, quote cards. Every image type uses the best AI for the job. Face-match (Pixar characters that look like you) is Agency only.",
    features: [
      "Pixar/Disney-quality 3D character scenes",
      "Programmatic quote cards (perfect text, every time)",
      "Editorial photography via Google Gemini (free)",
      "Carousel slide generation",
      "Branded overlay with logo, CTA, and profile picture",
      "Face-matched spokesperson images (Agency)",
    ],
    accentColor: "#D97706",
    gradient: "from-amber-500 to-orange-600",
  },
  {
    tag: "Regulatory Review",
    availability: "Pro and Agency",
    tagColor: "bg-red-50 text-red-700",
    availColor: "text-red-600",
    title: "Compliance review that catches what humans miss.",
    description:
      "Three-colour MLR workflow maps every sentence to Legal, Regulatory, or Compliance responsibilities. Sentence-level analysis with regulation references and suggested compliant alternatives.",
    features: [
      "ABPI, MHRA, FDA, EU MDR frameworks",
      "Three-colour coding: Legal / Regulatory / Compliance",
      "Sentence-level flagging with suggested alternatives",
      "Professional numbered compliance reports with PDF export",
      "Audit trail for every review",
      "10+ country market coverage",
    ],
    accentColor: "#DC2626",
    gradient: "from-red-500 to-rose-600",
  },
];

const CONTENT_TYPES = [
  "Social Posts",
  "Articles",
  "Blogs",
  "Carousels",
  "Newsletters",
  "Case Studies",
];

const PLATFORMS = [
  "LinkedIn",
  "X",
  "Facebook",
  "Instagram",
  "WordPress",
  "Threads",
  "Bluesky",
  "Wix",
];

const PLATFORM_FEATURES = [
  {
    title: "One-Click Publishing",
    description:
      "Post directly to LinkedIn with images and first comments.",
    icon: "M6 12L3.27 3.13A59.77 59.77 0 0121.49 12 59.77 59.77 0 013.27 20.87L6 12zm0 0h7.5",
  },
  {
    title: "Multi-Spokesperson",
    description:
      "Multiple voices, one brand. Each person gets their own voice profile.",
    icon: "M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z",
  },
  {
    title: "Content Calendar",
    description:
      "Plan weeks and months with strategic ecosystem linking.",
    icon: "M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5",
  },
  {
    title: "Voice Dictation",
    description: "Set up your brand voice by simply speaking.",
    icon: "M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z",
  },
];

const STEPS = [
  {
    number: "01",
    title: "Set up your brand",
    description:
      "Record a voice note, paste your LinkedIn URL, or fill in details. We extract your voice, audience, and differentiators in under a minute.",
  },
  {
    number: "02",
    title: "Choose your modules",
    description:
      "Start with the Copy Engine. Add Regulatory Review for compliance-heavy industries. Add Creative AI for premium visual assets.",
  },
  {
    number: "03",
    title: "Generate content",
    description:
      "AI creates posts in your voice with quality gates for healthcare specificity, hook tension, and brand consistency.",
  },
  {
    number: "04",
    title: "Review, approve, publish",
    description:
      "Compliance review flags issues before they become problems. One click to publish to LinkedIn with images and first comments.",
  },
];

const WITHOUT = [
  "Hours spent writing one LinkedIn post",
  "Inconsistent posting schedule",
  "Content that sounds like ChatGPT, not you",
  "No compliance review before publishing",
  "Generic stock images",
];

const WITH = [
  "Generate a week of posts in 5 minutes",
  "Strategic content ecosystem, not random posts",
  "39 quality checks ensure your authentic voice",
  "Three-colour regulatory review before anything goes live",
  "Pixar 3D, quote cards, and editorial photography on demand",
];

// ─── Page ────────────────────────────────────────────────────────

export default function LandingPage() {
  return (
    <>
      {/* ═══════════ HERO ═══════════ */}
      <section className="relative overflow-hidden">
        <div className="mx-auto max-w-6xl px-6 pt-20 pb-16 sm:pt-28 sm:pb-20 lg:pt-36 lg:pb-24">
          <div className="mx-auto max-w-3xl text-center">
            <p className="mb-5 inline-block rounded-full bg-violet-100 px-4 py-1.5 text-xs font-semibold text-violet-700">
              7-day free trial &middot; No credit card required
            </p>
            <h1 className="text-4xl font-bold tracking-tight text-gray-900 sm:text-5xl lg:text-6xl leading-[1.1]">
              Your weekly demand ecosystem,{" "}
              <span className="bg-gradient-to-r from-violet-600 to-indigo-600 bg-clip-text text-transparent">
                deployed in minutes.
              </span>
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg text-gray-500 sm:text-xl">
              You have the expertise. You just don&apos;t have the time to share it.
            </p>

            <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
              <Link
                href="/signup"
                className="w-full rounded-lg bg-violet-600 px-8 py-3.5 text-sm font-semibold text-white shadow-sm hover:bg-violet-700 transition-colors sm:w-auto"
              >
                Start your free trial
              </Link>
              <Link
                href="#how-it-works"
                className="w-full rounded-lg border border-gray-300 px-8 py-3.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors sm:w-auto"
              >
                See how it works
              </Link>
            </div>

            {/* Google sign-in */}
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

        {/* Background glow */}
        <div className="absolute inset-x-0 top-0 -z-10 h-full overflow-hidden">
          <div className="absolute -top-40 left-1/2 -translate-x-1/2 h-[600px] w-[900px] rounded-full bg-violet-100/50 blur-3xl" />
        </div>
      </section>

      {/* ═══════════ CONTENT TYPES STRIP ═══════════ */}
      <section className="border-y border-gray-100 bg-gray-50/80 py-10">
        <div className="mx-auto max-w-6xl px-6 text-center">
          <p className="text-sm text-gray-400 mb-4">
            Best practice social media content&hellip; <span className="font-semibold text-gray-700">Made by you.</span>
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2">
            {CONTENT_TYPES.map((type) => (
              <span
                key={type}
                className="rounded-full border border-violet-200 bg-violet-50 px-4 py-1.5 text-xs font-semibold text-violet-700"
              >
                {type}
              </span>
            ))}
          </div>
          <p className="mt-5 text-sm text-gray-500">
            All designed to amplify your thought leadership and generate demand.
          </p>
          <p className="text-xs font-semibold text-gray-700 mt-1">
            Every week. Made by you. Made in minutes.
          </p>
        </div>
      </section>

      {/* ═══════════ SOCIAL PROOF + PLATFORMS ═══════════ */}
      <section className="py-10">
        <div className="mx-auto max-w-6xl px-6">
          <p className="text-center text-sm text-gray-500 mb-6">
            Built by <strong className="text-gray-700">AGENCY Bristol</strong>, a healthcare demand generation consultancy.
            We built this for our own 10-week production workflow, then opened it up.
          </p>

          <div className="flex flex-col items-center gap-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">
              Publish to
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              {PLATFORMS.map((platform) => (
                <span
                  key={platform}
                  className="rounded-lg border border-gray-200 bg-white px-3.5 py-2 text-xs font-medium text-gray-600 shadow-sm"
                >
                  {platform}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════ POST SHOWCASE ═══════════ */}
      <section className="bg-gray-50/80 py-20 sm:py-28">
        <div className="mx-auto max-w-6xl px-6">
          <div className="mx-auto max-w-2xl text-center mb-14">
            <h2 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
              One click. Complete post.
            </h2>
            <p className="mt-4 text-lg text-gray-600">
              Not just images. Not just copy. Everything your LinkedIn post needs,
              generated together, ready to publish.
            </p>
          </div>
          <PostShowcase />
        </div>
      </section>

      {/* ═══════════ THREE MODULES ═══════════ */}
      <section className="py-20 sm:py-28" id="features">
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
                className="rounded-2xl border border-gray-200 bg-white overflow-hidden shadow-sm hover:shadow-md transition-shadow"
              >
                <div className="h-1" style={{ backgroundColor: mod.accentColor }} />
                <div className="p-8 lg:p-10">
                  <div className={`grid gap-8 ${i % 2 === 1 ? "lg:grid-cols-[1fr_1.2fr]" : "lg:grid-cols-[1.2fr_1fr]"}`}>
                    <div className={i % 2 === 1 ? "lg:order-2" : ""}>
                      <div className="flex items-center gap-2 mb-4">
                        <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${mod.tagColor}`}>
                          {mod.tag}
                        </span>
                        <span className={`text-xs font-medium ${mod.availColor}`}>
                          {mod.availability}
                        </span>
                      </div>
                      <h3 className="text-2xl font-bold text-gray-900">
                        {mod.title}
                      </h3>
                      <p className="mt-3 text-base text-gray-600 leading-relaxed">
                        {mod.description}
                      </p>
                    </div>

                    <div className={i % 2 === 1 ? "lg:order-1" : ""}>
                      <ul className="space-y-3">
                        {mod.features.map((feature) => (
                          <li key={feature} className="flex items-start gap-3 text-sm text-gray-700">
                            <svg
                              className="mt-0.5 h-4 w-4 flex-shrink-0"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke={mod.accentColor}
                              strokeWidth="2.5"
                            >
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

      {/* ═══════════ DIVIDER ═══════════ */}
      <div className="bg-gradient-to-r from-violet-600 to-indigo-600 py-8">
        <p className="text-center text-lg font-semibold text-white sm:text-xl">
          Because posting consistently is the hardest part of generating demand.
        </p>
      </div>

      {/* ═══════════ PLATFORM FEATURES ═══════════ */}
      <section className="py-16">
        <div className="mx-auto max-w-6xl px-6">
          <h3 className="text-center text-sm font-semibold uppercase tracking-wider text-gray-400 mb-10">
            Every plan includes the full toolkit
          </h3>
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {PLATFORM_FEATURES.map((feat) => (
              <div key={feat.title} className="text-center">
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-violet-50 text-violet-600">
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d={feat.icon} />
                  </svg>
                </div>
                <p className="text-sm font-semibold text-gray-900">{feat.title}</p>
                <p className="mt-1 text-xs text-gray-500">{feat.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════ HOW IT WORKS ═══════════ */}
      <section className="bg-gray-50/80 py-20 sm:py-28" id="how-it-works">
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
                <div className="mb-3 text-4xl font-bold bg-gradient-to-r from-violet-300 to-indigo-300 bg-clip-text text-transparent">
                  {step.number}
                </div>
                <h3 className="text-base font-semibold text-gray-900">{step.title}</h3>
                <p className="mt-2 text-sm text-gray-600 leading-relaxed">{step.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════ WITHOUT vs WITH ═══════════ */}
      <section className="py-20 sm:py-28">
        <div className="mx-auto max-w-6xl px-6">
          <div className="mx-auto max-w-2xl text-center mb-14">
            <h2 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
              Content consistency is the hardest part of demand generation
            </h2>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            {/* Without */}
            <div className="rounded-2xl border border-red-100 bg-red-50/50 p-8">
              <h3 className="flex items-center gap-2 text-lg font-bold text-red-700 mb-6">
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M6 18L18 6M6 6l12 12" />
                </svg>
                Without AGENCY
              </h3>
              <ul className="space-y-4">
                {WITHOUT.map((item) => (
                  <li key={item} className="flex items-start gap-3 text-sm text-red-800">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-500 text-xs">
                      &times;
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            {/* With */}
            <div className="rounded-2xl border border-green-100 bg-green-50/50 p-8">
              <h3 className="flex items-center gap-2 text-lg font-bold text-green-700 mb-6">
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M5 13l4 4L19 7" />
                </svg>
                With AGENCY
              </h3>
              <ul className="space-y-4">
                {WITH.map((item) => (
                  <li key={item} className="flex items-start gap-3 text-sm text-green-800">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-green-100 text-green-600 text-xs font-bold">
                      &#10003;
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════ PROVOCATIVE DIVIDER ═══════════ */}
      <div className="bg-gray-900 py-10">
        <p className="text-center text-lg font-semibold text-white sm:text-xl max-w-3xl mx-auto px-6">
          Your competitors are posting four times a week.{" "}
          <span className="text-violet-400">When did you last post?</span>
        </p>
      </div>

      {/* ═══════════ PRICING ═══════════ */}
      <section className="py-20 sm:py-28" id="pricing">
        <div className="mx-auto max-w-6xl px-6">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
              Start creating. Upgrade when you&apos;re ready.
            </h2>
            <p className="mt-4 text-lg text-gray-600">
              Every plan includes Pixar-quality visuals. Premium modules unlock advanced capabilities.
            </p>
          </div>

          <div className="mt-16 grid gap-6 lg:grid-cols-3">
            {/* Starter */}
            <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
              <h3 className="text-lg font-semibold text-gray-900">Starter</h3>
              <p className="mt-4">
                <span className="text-4xl font-bold text-gray-900">&pound;30</span>
                <span className="text-sm text-gray-500">/month</span>
              </p>
              <ul className="mt-8 space-y-3 text-sm text-gray-600">
                <li className="flex items-start gap-2"><span className="text-green-500 mt-0.5">&#10003;</span> 20 posts per month</li>
                <li className="flex items-start gap-2"><span className="text-green-500 mt-0.5">&#10003;</span> 1 spokesperson</li>
                <li className="flex items-start gap-2"><span className="text-green-500 mt-0.5">&#10003;</span> ALL visual styles (Pixar 3D, scene quotes, editorial, quote cards)</li>
                <li className="flex items-start gap-2"><span className="text-green-500 mt-0.5">&#10003;</span> Basic voice matching</li>
                <li className="flex items-start gap-2"><span className="text-green-500 mt-0.5">&#10003;</span> LinkedIn + Bluesky publishing</li>
                <li className="flex items-start gap-2"><span className="text-green-500 mt-0.5">&#10003;</span> Brand overlay on all images</li>
              </ul>
              <Link href="/signup" className="mt-8 block w-full rounded-lg border border-gray-300 py-2.5 text-center text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors">
                Start 7-day free trial
              </Link>
            </div>

            {/* Pro */}
            <div className="relative rounded-2xl border-2 border-violet-600 bg-white p-8 shadow-md">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-violet-600 px-3 py-0.5 text-xs font-semibold text-white">
                Most popular
              </div>
              <h3 className="text-lg font-semibold text-gray-900">Pro</h3>
              <p className="mt-4">
                <span className="text-4xl font-bold text-gray-900">&pound;99</span>
                <span className="text-sm text-gray-500">/month</span>
              </p>
              <ul className="mt-8 space-y-3 text-sm text-gray-600">
                <li className="flex items-start gap-2"><span className="text-green-500 mt-0.5">&#10003;</span> Unlimited posts</li>
                <li className="flex items-start gap-2"><span className="text-green-500 mt-0.5">&#10003;</span> Unlimited spokespersons</li>
                <li className="flex items-start gap-2"><span className="text-violet-500 mt-0.5 font-bold">+</span> <span><strong>Full voice matching</strong> (39 quality gates)</span></li>
                <li className="flex items-start gap-2"><span className="text-violet-500 mt-0.5 font-bold">+</span> <span><strong>Regulatory compliance review</strong> (ABPI, MHRA, FDA)</span></li>
                <li className="flex items-start gap-2"><span className="text-green-500 mt-0.5">&#10003;</span> Carousel generation</li>
                <li className="flex items-start gap-2"><span className="text-green-500 mt-0.5">&#10003;</span> Content calendar with ecosystem linking</li>
                <li className="flex items-start gap-2"><span className="text-green-500 mt-0.5">&#10003;</span> Batch generation (whole week at once)</li>
                <li className="flex items-start gap-2"><span className="text-green-500 mt-0.5">&#10003;</span> Multi-platform publishing</li>
              </ul>
              <Link href="/signup" className="mt-8 block w-full rounded-lg bg-violet-600 py-2.5 text-center text-sm font-semibold text-white hover:bg-violet-700 transition-colors">
                Start 7-day free trial
              </Link>
            </div>

            {/* Agency */}
            <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
              <h3 className="text-lg font-semibold text-gray-900">Agency</h3>
              <p className="mt-4">
                <span className="text-4xl font-bold text-gray-900">&pound;299</span>
                <span className="text-sm text-gray-500">/month</span>
              </p>
              <ul className="mt-8 space-y-3 text-sm text-gray-600">
                <li className="flex items-start gap-2"><span className="text-green-500 mt-0.5">&#10003;</span> Everything in Pro</li>
                <li className="flex items-start gap-2"><span className="text-amber-500 mt-0.5 font-bold">+</span> <span><strong>Face-matched AI</strong> (Pixar characters that look like you)</span></li>
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

          <p className="mt-8 text-center text-sm text-gray-500">
            All plans include a 7-day Pro trial. No credit card required.
          </p>
        </div>
      </section>

      {/* ═══════════ QUOTE DIVIDER ═══════════ */}
      <div className="bg-gray-50 py-8">
        <p className="text-center text-lg font-semibold text-gray-400 italic">
          Great content, every week, without the grind.
        </p>
      </div>

      {/* ═══════════ FINAL CTA ═══════════ */}
      <section className="bg-gradient-to-br from-violet-600 to-indigo-700 py-20 sm:py-24">
        <div className="mx-auto max-w-4xl px-6 text-center">
          <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
            Ready to transform your content?
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-lg text-violet-200">
            One voice. Your voice. Every week. Without the work.
          </p>
          <div className="mt-8 flex flex-col items-center gap-4">
            <Link
              href="/signup"
              className="inline-block rounded-lg bg-white px-8 py-3.5 text-sm font-semibold text-violet-600 shadow-sm hover:bg-violet-50 transition-colors"
            >
              Start your free trial
            </Link>
            <p className="text-sm text-violet-200">
              7-day Pro trial. Then choose Starter (&pound;30/mo), Pro (&pound;99/mo), or Agency (&pound;299/mo).
            </p>
            <div className="mt-2">
              <GoogleSignInButton />
            </div>
            <p className="text-xs text-violet-300">
              Already have an account?{" "}
              <Link href="/login" className="underline hover:text-white">
                Log in
              </Link>
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
