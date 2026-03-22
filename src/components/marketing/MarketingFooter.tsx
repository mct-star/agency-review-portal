import Link from "next/link";

export default function MarketingFooter() {
  return (
    <footer className="border-t border-gray-200 bg-gray-50">
      <div className="mx-auto max-w-6xl px-6 py-12">
        <div className="grid gap-8 sm:grid-cols-3">
          <div>
            <p className="text-lg font-bold tracking-tight text-gray-900">
              AGENCY<span className="text-violet-600">.</span>
            </p>
            <p className="mt-2 text-sm text-gray-500">
              AI-powered content for healthcare companies. Built by AGENCY Bristol.
            </p>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-gray-900">Product</h3>
            <ul className="mt-3 space-y-2">
              <li><Link href="/how-it-works" className="text-sm text-gray-500 hover:text-gray-700">How It Works</Link></li>
              <li><Link href="/pricing" className="text-sm text-gray-500 hover:text-gray-700">Pricing</Link></li>
              <li><Link href="/signup" className="text-sm text-gray-500 hover:text-gray-700">Start Free Trial</Link></li>
            </ul>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-gray-900">Company</h3>
            <ul className="mt-3 space-y-2">
              <li><a href="https://agencybristol.com" target="_blank" rel="noopener noreferrer" className="text-sm text-gray-500 hover:text-gray-700">AGENCY Bristol</a></li>
              <li><Link href="/login" className="text-sm text-gray-500 hover:text-gray-700">Sign In</Link></li>
            </ul>
          </div>
        </div>

        <div className="mt-8 border-t border-gray-200 pt-6">
          <p className="text-xs text-gray-400">
            &copy; {new Date().getFullYear()} AGENCY Bristol Ltd. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
