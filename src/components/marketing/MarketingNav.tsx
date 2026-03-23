import Link from "next/link";
import Image from "next/image";

export default function MarketingNav() {
  return (
    <nav className="sticky top-0 z-50 border-b border-gray-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <Link href="/" className="flex items-center gap-2">
          <Image
            src="/images/agency-logo.png"
            alt="AGENCY Healthcare Demand Generation"
            width={120}
            height={48}
            className="h-8 w-auto"
            priority
          />
        </Link>

        <div className="hidden items-center gap-8 sm:flex">
          <Link href="/#features" className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors">
            Features
          </Link>
          <Link href="/#pricing" className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors">
            Pricing
          </Link>
          <Link href="/#how-it-works" className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors">
            How It Works
          </Link>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/login"
            className="rounded-lg px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900 transition-colors"
          >
            Log in
          </Link>
          <Link
            href="/signup"
            className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700 transition-colors"
          >
            Start free trial
          </Link>
        </div>
      </div>
    </nav>
  );
}
