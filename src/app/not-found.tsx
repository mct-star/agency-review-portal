import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="text-center max-w-md px-6">
        <p className="text-7xl font-black text-violet-600">404</p>
        <h1 className="mt-4 text-xl font-bold text-gray-900">Page not found</h1>
        <p className="mt-2 text-sm text-gray-500">
          The page you are looking for does not exist or has been moved.
        </p>
        <div className="mt-6 flex items-center justify-center gap-3">
          <Link
            href="/dashboard"
            className="rounded-lg bg-violet-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-violet-700 transition-colors"
          >
            Go to Dashboard
          </Link>
          <Link
            href="/"
            className="rounded-lg border border-gray-300 px-5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Home
          </Link>
        </div>
        <p className="mt-8 text-xs text-gray-400">
          You have the expertise. We give you the time to share it.
        </p>
      </div>
    </div>
  );
}
