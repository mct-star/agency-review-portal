"use client";

import { Suspense, useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginMode, setLoginMode] = useState<"magic" | "password">("password");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const searchParams = useSearchParams();

  useEffect(() => {
    const authError = searchParams.get("error");
    if (authError) {
      setError(`Login failed: ${authError}`);
    }
  }, [searchParams]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createClient();

    if (loginMode === "password") {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) {
        setError(error.message);
        setLoading(false);
      } else {
        window.location.href = "/dashboard";
      }
    } else {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });
      if (error) {
        setError(error.message);
        setLoading(false);
      } else {
        setSent(true);
        setLoading(false);
      }
    }
  }

  return (
    <div className="w-full max-w-sm space-y-8 rounded-xl bg-white p-8 shadow-sm border border-gray-200">
      <div className="text-center">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">
          AGENCY
        </h1>
        <p className="mt-1 text-sm text-gray-500">Content Platform</p>
        <p className="mt-3 text-xs text-gray-400">
          One voice. Your voice. Every week. Without the work.
        </p>
      </div>

      {sent ? (
        <div className="rounded-lg bg-sky-50 p-4 text-center">
          <p className="text-sm font-medium text-sky-800">
            Check your email
          </p>
          <p className="mt-1 text-sm text-sky-600">
            We sent a login link to <strong>{email}</strong>
          </p>
        </div>
      ) : (
        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700">
              Email address
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              required
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
            />
          </div>

          {loginMode === "password" && (
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Your password"
                required
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
              />
            </div>
          )}

          {error && (
            <p className="text-sm text-red-600">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (loginMode === "password" ? "Signing in..." : "Sending...") : (loginMode === "password" ? "Sign in" : "Send login link")}
          </button>

          <button
            type="button"
            onClick={() => setLoginMode(loginMode === "password" ? "magic" : "password")}
            className="w-full text-xs text-gray-400 hover:text-gray-600 transition-colors"
          >
            {loginMode === "password" ? "Use magic link instead" : "Use password instead"}
          </button>

          <div className="text-center">
            <a href="/signup" className="text-xs font-medium text-violet-600 hover:text-violet-700">
              Don&apos;t have an account? Start free trial
            </a>
          </div>
        </form>
      )}
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <Suspense fallback={
        <div className="w-full max-w-sm space-y-8 rounded-xl bg-white p-8 shadow-sm border border-gray-200">
          <div className="text-center">
            <h1 className="text-2xl font-bold tracking-tight text-gray-900">
              AGENCY Bristol
            </h1>
            <p className="mt-1 text-sm text-gray-500">Content Platform</p>
          </div>
        </div>
      }>
        <LoginForm />
      </Suspense>
    </div>
  );
}
