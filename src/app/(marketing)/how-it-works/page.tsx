import Link from "next/link";

const STEPS = [
  {
    number: "01",
    title: "Set up your brand in under 2 minutes",
    description: "Three ways to get started. Pick whichever suits you.",
    details: [
      "Record a 20-second voice note describing your business. AI extracts your voice, audience, differentiators, and suggested topics.",
      "Paste your LinkedIn URL and website. We pull in your photo, company details, brand colours, and professional context automatically.",
      "Or fill in the details manually through our guided setup wizard with 8 configurable sections.",
    ],
  },
  {
    number: "02",
    title: "Generate content in your voice",
    description: "Choose from 7 post types designed for B2B healthcare engagement.",
    details: [
      "Problem Diagnosis. Experience Story. Expert Perspective. Contrarian Take. Tactical How-To. Personal Reflection. Article Teaser.",
      "Each post type has its own image style. Pixar-style 3D scenes for stories. Bold quote cards for insights. Carousel slides for frameworks.",
      "Generate a single post instantly, or plan a full week ecosystem where each post builds on the last with strategic CTA hierarchy.",
    ],
  },
  {
    number: "03",
    title: "Review with built-in compliance",
    description: "Regulatory checks for 10 countries. Catch issues before they become problems.",
    details: [
      "Sentence-level analysis flags medical claims, off-label promotion, missing disclaimers, and product mentions against ABPI, MHRA, FDA, and EU MDR frameworks.",
      "Each flagged issue includes the specific regulation cited, a risk level, and a suggested compliant alternative.",
      "Score your content 0-100 for regulatory confidence. Approve pieces through an audit-trailed workflow.",
    ],
  },
  {
    number: "04",
    title: "Publish and track",
    description: "Post directly to LinkedIn. Download for everything else.",
    details: [
      "One-click LinkedIn publishing with images, branded overlays, and automatic first comments.",
      "Download images with your brand overlay applied. Copy text formatted for any platform.",
      "Every published piece is tracked with audit trail. See what went out, when, and where.",
    ],
  },
];

export default function HowItWorksPage() {
  return (
    <>
      <section className="py-20 sm:py-28">
        <div className="mx-auto max-w-4xl px-6">
          <div className="mx-auto max-w-2xl text-center">
            <h1 className="text-4xl font-bold tracking-tight text-gray-900 sm:text-5xl">
              How it works
            </h1>
            <p className="mt-4 text-lg text-gray-600">
              From brand setup to published content in four steps.
              Set up once, generate every week.
            </p>
          </div>

          <div className="mt-20 space-y-20">
            {STEPS.map((step) => (
              <div key={step.number} className="relative">
                <div className="flex items-start gap-6">
                  <div className="shrink-0">
                    <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-violet-100 text-xl font-bold text-violet-600">
                      {step.number}
                    </div>
                  </div>
                  <div className="flex-1">
                    <h2 className="text-2xl font-bold text-gray-900">{step.title}</h2>
                    <p className="mt-2 text-base text-gray-600">{step.description}</p>
                    <ul className="mt-6 space-y-4">
                      {step.details.map((detail, i) => (
                        <li key={i} className="flex items-start gap-3">
                          <div className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-violet-400" />
                          <p className="text-sm text-gray-600">{detail}</p>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-violet-600 py-16">
        <div className="mx-auto max-w-4xl px-6 text-center">
          <h2 className="text-3xl font-bold tracking-tight text-white">
            See it for yourself
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-lg text-violet-100">
            Start your 7-day free trial. Full Pro access, no credit card.
          </p>
          <div className="mt-8 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <Link
              href="/signup"
              className="inline-block rounded-lg bg-white px-8 py-3.5 text-sm font-semibold text-violet-600 shadow-sm hover:bg-violet-50 transition-colors"
            >
              Start your free trial
            </Link>
            <Link
              href="/pricing"
              className="inline-block rounded-lg border border-white/30 px-8 py-3.5 text-sm font-semibold text-white hover:bg-white/10 transition-colors"
            >
              View pricing
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
