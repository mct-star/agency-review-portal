import Link from "next/link";
import type { Metadata } from "next";
import { createServerSupabaseClient, getUserProfile } from "@/lib/supabase/server";
import RotatingQuote from "@/components/home/RotatingQuote";

export const metadata: Metadata = {
  title: "Home | AGENCY",
  description: "Let's create demand for you",
};

export default async function HomePage() {
  const profile = await getUserProfile();
  const supabase = await createServerSupabaseClient();
  const isAdmin = profile?.role === "admin";
  const companyId = profile?.company_id;
  const firstName = (profile?.full_name || "there").split(" ")[0];

  // Fetch pending review count for the badge
  let pendingCount = 0;
  {
    let contentQuery = supabase
      .from("content_pieces")
      .select("id", { count: "exact", head: true })
      .eq("approval_status", "pending");
    if (!isAdmin && companyId) {
      contentQuery = contentQuery.eq("company_id", companyId);
    }
    const { count } = await contentQuery;
    pendingCount = count || 0;
  }

  return (
    <div className="mx-auto max-w-6xl">
      {/* ===== Mission + Rotating Quote ===== */}
      <section className="pt-10 pb-10 text-center">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">
          Let&apos;s create demand for you, {firstName}.
        </h1>

        <RotatingQuote />
      </section>

      {/* ===== Navigation tiles ===== */}
      <section className="grid gap-5 sm:grid-cols-3" style={{ minHeight: "380px" }}>
        {/* Quick Generate */}
        <Link
          href="/generate/quick"
          className="group relative flex flex-col items-center justify-center overflow-hidden rounded-3xl bg-gradient-to-br from-violet-600 to-violet-800 p-10 text-white shadow-lg transition-all hover:shadow-2xl hover:scale-[1.01]"
        >
          <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-white/15 backdrop-blur-sm transition-transform group-hover:scale-110">
            <svg className="h-10 w-10" viewBox="0 0 24 24" fill="currentColor">
              <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
            </svg>
          </div>
          <h2 className="mt-6 text-2xl font-bold">Quick Generate</h2>
          <p className="mt-2 text-sm text-violet-200 text-center max-w-xs">
            One post in 30 seconds. Pick a topic, choose a style, publish.
          </p>
          <div className="mt-6 inline-flex items-center gap-2 rounded-full bg-white/20 backdrop-blur-sm px-5 py-2.5 text-sm font-semibold transition-all group-hover:bg-white/30 group-hover:gap-3">
            Generate now
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
          </div>
        </Link>

        {/* Content Studio */}
        <Link
          href="/generate/studio"
          className="group relative flex flex-col items-center justify-center overflow-hidden rounded-3xl bg-gradient-to-br from-amber-500 to-orange-600 p-10 text-white shadow-lg transition-all hover:shadow-2xl hover:scale-[1.01]"
        >
          <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-white/15 backdrop-blur-sm transition-transform group-hover:scale-110">
            <svg className="h-10 w-10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 2L14.09 8.26L20 9.27L15.55 13.97L16.91 20L12 16.9L7.09 20L8.45 13.97L4 9.27L9.91 8.26L12 2Z" />
            </svg>
          </div>
          <h2 className="mt-6 text-2xl font-bold">Content Studio</h2>
          <p className="mt-2 text-sm text-amber-100 text-center max-w-xs">
            Plan a full week or month. Strategic ecosystem with linked posts.
          </p>
          <div className="mt-6 inline-flex items-center gap-2 rounded-full bg-white/20 backdrop-blur-sm px-5 py-2.5 text-sm font-semibold transition-all group-hover:bg-white/30 group-hover:gap-3">
            Open studio
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
          </div>
        </Link>

        {/* Review Content */}
        <Link
          href="/content"
          className="group relative flex flex-col items-center justify-center overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-500 to-teal-600 p-10 text-white shadow-lg transition-all hover:shadow-2xl hover:scale-[1.01]"
        >
          <div className="relative flex h-20 w-20 items-center justify-center rounded-2xl bg-white/15 backdrop-blur-sm transition-transform group-hover:scale-110">
            <svg className="h-10 w-10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {pendingCount > 0 && (
              <span className="absolute -top-2 -right-2 flex h-7 w-7 items-center justify-center rounded-full bg-red-500 text-xs font-bold text-white ring-2 ring-white">
                {pendingCount > 99 ? "99+" : pendingCount}
              </span>
            )}
          </div>
          <h2 className="mt-6 text-2xl font-bold">Review Content</h2>
          <p className="mt-2 text-sm text-emerald-100 text-center max-w-xs">
            {pendingCount > 0
              ? `${pendingCount} post${pendingCount !== 1 ? "s" : ""} awaiting review. Approve and publish.`
              : "Review, approve, and publish your content."}
          </p>
          <div className="mt-6 inline-flex items-center gap-2 rounded-full bg-white/20 backdrop-blur-sm px-5 py-2.5 text-sm font-semibold transition-all group-hover:bg-white/30 group-hover:gap-3">
            Review now
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
          </div>
        </Link>
      </section>
    </div>
  );
}
