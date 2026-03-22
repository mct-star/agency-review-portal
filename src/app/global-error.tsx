"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-gray-50 antialiased">
        <div className="flex min-h-screen items-center justify-center">
          <div className="text-center max-w-md px-6">
            <p className="text-5xl font-black text-red-500">Oops</p>
            <h1 className="mt-4 text-xl font-bold text-gray-900">Something went wrong</h1>
            <p className="mt-2 text-sm text-gray-500">
              {error.message || "An unexpected error occurred. Our team has been notified."}
            </p>
            {error.digest && (
              <p className="mt-1 text-[10px] text-gray-300 font-mono">Error ID: {error.digest}</p>
            )}
            <div className="mt-6 flex items-center justify-center gap-3">
              <button
                onClick={reset}
                className="rounded-lg bg-violet-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-violet-700 transition-colors"
              >
                Try again
              </button>
              <a
                href="/dashboard"
                className="rounded-lg border border-gray-300 px-5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Go to Dashboard
              </a>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
