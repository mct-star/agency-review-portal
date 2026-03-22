import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy",
};

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-2xl px-6 py-16">
      <Link href="/" className="text-xs text-violet-600 hover:text-violet-700">&larr; Back</Link>
      <h1 className="mt-4 text-2xl font-bold text-gray-900">Privacy Policy</h1>
      <p className="mt-2 text-sm text-gray-500">Last updated: March 2026</p>

      <div className="mt-8 space-y-6 text-sm text-gray-700 leading-relaxed">
        <section>
          <h2 className="font-semibold text-gray-900">1. What We Collect</h2>
          <p>We collect the information you provide when creating an account: name, email address, company name, and optional LinkedIn profile URL. We also collect content you generate using the platform and voice profile data you provide for tone matching.</p>
        </section>

        <section>
          <h2 className="font-semibold text-gray-900">2. How We Use It</h2>
          <p>Your data is used to: provide the content generation service, match your voice and tone in generated content, perform regulatory compliance reviews, and improve the platform. We do not sell your data to third parties.</p>
        </section>

        <section>
          <h2 className="font-semibold text-gray-900">3. AI Processing</h2>
          <p>Content is generated using third-party AI models (Anthropic Claude, Google Gemini, fal.ai). Your prompts and company context are sent to these providers for processing. These providers have their own privacy policies and data retention practices. Generated content is stored in our database for your access.</p>
        </section>

        <section>
          <h2 className="font-semibold text-gray-900">4. Data Storage</h2>
          <p>Data is stored securely using Supabase (hosted on AWS). Images are stored in Supabase Storage. Sensitive credentials (social media tokens, API keys) are encrypted at rest using AES-256.</p>
        </section>

        <section>
          <h2 className="font-semibold text-gray-900">5. Social Media Connections</h2>
          <p>When you connect LinkedIn or Bluesky accounts, we store encrypted access tokens to publish content on your behalf. We only post content you explicitly choose to publish. You can disconnect accounts at any time.</p>
        </section>

        <section>
          <h2 className="font-semibold text-gray-900">6. Your Rights</h2>
          <p>Under GDPR you have the right to: access your data, correct inaccurate data, delete your account and all associated data, export your data, and withdraw consent at any time. Contact mct@agencybristol.com to exercise these rights.</p>
        </section>

        <section>
          <h2 className="font-semibold text-gray-900">7. Cookies</h2>
          <p>We use essential cookies for authentication (Supabase session tokens). We do not use tracking cookies, analytics cookies, or advertising cookies.</p>
        </section>

        <section>
          <h2 className="font-semibold text-gray-900">8. Contact</h2>
          <p>Data Controller: AGENCY Bristol Ltd, Bristol, United Kingdom. For privacy enquiries: mct@agencybristol.com.</p>
        </section>
      </div>
    </div>
  );
}
