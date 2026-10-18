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
      <p className="mt-2 text-sm text-gray-500">Last updated: 18 October 2026</p>

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
          <p>Content is generated using third-party AI models. Your prompts and company context are sent to these providers for processing. These providers have their own privacy policies and data retention practices. Generated content is stored in our database for your access.</p>
        </section>

        <section>
          <h2 className="font-semibold text-gray-900">4. Data Storage</h2>
          <p>Content and images are stored in our hosted database and file storage. Sensitive credentials (social media tokens, API keys) are encrypted at rest using AES-256.</p>
        </section>

        <section>
          <h2 className="font-semibold text-gray-900">5. Social Media Connections</h2>
          <p>When you connect a social account, we store its account identifier, name and encrypted access token to publish content you approve and choose to publish. Facebook and Instagram connections let you select a Facebook Page or its linked professional Instagram account. We use the permissions you grant to identify the accounts you manage and publish to your selected destination.</p>
          <p className="mt-2">We also store the post, selected account, publication time and publishing result so you can track scheduled and published content.</p>
          <p className="mt-2">Saved connection tokens are encrypted in server storage. During authorisation, a temporary encrypted cookie holds pending connection data. Access tokens are not returned in publishing status responses.</p>
          <div id="social-data-deletion" className="mt-3 space-y-2">
            <h3 className="font-semibold text-gray-900">Disconnecting and deleting social connection data</h3>
            <p>To stop Facebook and linked Instagram publishing, open Publish and choose Disconnect this Page and linked Instagram beside the connection. This removes the saved access tokens and disables both connections for the selected Page. Queued posts are checked before publishing and cannot start through a disabled connection. A post already being sent may finish. You can also revoke the app&apos;s access in your Facebook settings.</p>
            <p>To request deletion of your stored social connection data, email <a href="mailto:mct@agencybristol.com?subject=Social%20connection%20data%20deletion" className="underline">mct@agencybristol.com</a> from your registered address, naming your company and the connected account. We will verify the request and arrange deletion. Disconnecting or deleting a connection does not remove posts already published on a social network.</p>
          </div>
        </section>

        <section>
          <h2 className="font-semibold text-gray-900">6. Your Rights</h2>
          <p>Under GDPR you have the right to: access your data, correct inaccurate data, delete your account and all associated data, export your data, and withdraw consent at any time. Contact mct@agencybristol.com to exercise these rights.</p>
        </section>

        <section>
          <h2 className="font-semibold text-gray-900">7. Cookies</h2>
          <p>We use essential cookies for sign-in and temporary social account authorisation.</p>
        </section>

        <section>
          <h2 className="font-semibold text-gray-900">8. Contact</h2>
          <p>Data Controller: AGENCY Bristol Ltd, Bristol, United Kingdom. For privacy enquiries: mct@agencybristol.com.</p>
        </section>
      </div>
    </div>
  );
}
