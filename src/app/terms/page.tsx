import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms of Service",
};

export default function TermsPage() {
  return (
    <div className="mx-auto max-w-2xl px-6 py-16">
      <Link href="/" className="text-xs text-violet-600 hover:text-violet-700">&larr; Back</Link>
      <h1 className="mt-4 text-2xl font-bold text-gray-900">Terms of Service</h1>
      <p className="mt-2 text-sm text-gray-500">Last updated: March 2026</p>

      <div className="mt-8 space-y-6 text-sm text-gray-700 leading-relaxed">
        <section>
          <h2 className="font-semibold text-gray-900">1. Service</h2>
          <p>AGENCY Content Platform (&quot;the Service&quot;) is provided by AGENCY Bristol Ltd. The Service provides AI-powered content generation, regulatory compliance review, and social media publishing tools.</p>
        </section>

        <section>
          <h2 className="font-semibold text-gray-900">2. Accounts</h2>
          <p>You must provide accurate information when creating an account. You are responsible for maintaining the security of your account credentials. You must be at least 18 years old to use the Service.</p>
        </section>

        <section>
          <h2 className="font-semibold text-gray-900">3. Content Ownership</h2>
          <p>You retain full ownership of all content you create using the Service. AI-generated content becomes yours upon generation. We do not claim any rights to your content, brand assets, or voice profiles.</p>
        </section>

        <section>
          <h2 className="font-semibold text-gray-900">4. Acceptable Use</h2>
          <p>You agree not to use the Service to generate content that is illegal, defamatory, misleading, or in violation of applicable advertising regulations. The regulatory compliance review is advisory and does not constitute legal advice.</p>
        </section>

        <section>
          <h2 className="font-semibold text-gray-900">5. Subscriptions & Billing</h2>
          <p>Paid plans are billed monthly in GBP. You may cancel at any time through the billing portal. Refunds are handled on a case-by-case basis. Free trials automatically convert to the Starter plan unless upgraded.</p>
        </section>

        <section>
          <h2 className="font-semibold text-gray-900">6. Limitation of Liability</h2>
          <p>The Service is provided &quot;as is&quot; without warranty. AGENCY Bristol Ltd is not liable for any damages arising from use of the Service, including but not limited to regulatory non-compliance of generated content. Users should always have content reviewed by qualified professionals before publication.</p>
        </section>

        <section>
          <h2 className="font-semibold text-gray-900">7. Contact</h2>
          <p>For questions about these terms, contact us at mct@agencybristol.com.</p>
        </section>
      </div>
    </div>
  );
}
