import Link from "next/link";
import type { Metadata } from "next";
import { createServerSupabaseClient, getUserProfile } from "@/lib/supabase/server";
import { ShareStrategyButton } from "./share-button";

export const metadata: Metadata = {
  title: "Strategy | AGENCY",
  description: "Build your content strategy with a guided interview process",
};

const STEP_LABELS = [
  "Who Are You?",
  "Who Do You Help?",
  "What Makes You Different?",
  "What's Your Voice?",
  "Content Pillars",
  "Weekly Rhythm",
  "Narrative Arc",
  "Strategy Document",
];

export default async function StrategyPage() {
  const profile = await getUserProfile();
  if (!profile) return null;

  const supabase = await createServerSupabaseClient();
  const companyId = profile.company_id;

  // Fetch company
  const { data: company } = await supabase
    .from("companies")
    .select("id, name, brand_color")
    .eq("id", companyId)
    .single();

  // Fetch existing strategy session
  const { data: session } = await supabase
    .from("strategy_sessions")
    .select("*")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // Fetch strategy document if completed
  const { data: strategyDoc } = session?.status === "completed"
    ? await supabase
        .from("strategy_documents")
        .select("id, pdf_url, version, share_token")
        .eq("company_id", companyId)
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle()
    : { data: null };

  const hasSession = !!session;
  const isCompleted = session?.status === "completed";
  const isInProgress = session?.status === "in_progress";
  const currentStep = session?.current_step ?? 0;

  return (
    <div className="mx-auto max-w-4xl">
      {/* Hero / Status Section */}
      <section className="pt-10 pb-10">
        {!hasSession ? (
          /* ───── No strategy yet ───── */
          <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
            <div className="h-1.5 bg-violet-600" />
            <div className="px-8 py-16 text-center">
              <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-2xl bg-violet-50 mb-6">
                <svg className="h-10 w-10 text-violet-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <h1 className="text-3xl font-bold tracking-tight text-gray-900">
                Build Your Content Strategy
              </h1>
              <p className="mt-4 text-lg text-gray-500 max-w-xl mx-auto">
                A guided 8-step interview that produces a professional content strategy document.
                We will ask about your audience, positioning, voice, and content rhythm, then
                generate a strategy you can share with your team.
              </p>
              <div className="mt-4 flex flex-wrap items-center justify-center gap-3 text-sm text-gray-500">
                {STEP_LABELS.map((label, i) => (
                  <span key={i} className="flex items-center gap-1.5">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-gray-100 text-[10px] font-semibold text-gray-500">
                      {i + 1}
                    </span>
                    {label}
                  </span>
                ))}
              </div>
              <Link
                href="/strategy/interview"
                className="mt-8 inline-flex items-center gap-2 rounded-xl bg-violet-600 px-8 py-4 text-lg font-semibold text-white shadow-lg transition-all hover:bg-violet-700 hover:shadow-xl hover:scale-[1.02]"
              >
                Start Strategy Interview
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              </Link>
            </div>
          </div>
        ) : (
          /* ───── Strategy exists ───── */
          <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
            <div
              className="h-1.5"
              style={{ backgroundColor: company?.brand_color || "#7c3aed" }}
            />
            <div className="px-8 py-10">
              <div className="flex items-start justify-between">
                <div>
                  <h1 className="text-2xl font-bold tracking-tight text-gray-900">
                    Content Strategy
                  </h1>
                  <p className="mt-1 text-sm text-gray-500">
                    {company?.name || "Your company"}
                  </p>
                </div>
                <span
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${
                    isCompleted
                      ? "bg-emerald-50 text-emerald-700"
                      : "bg-amber-50 text-amber-700"
                  }`}
                >
                  {isCompleted ? "Completed" : `In Progress - Step ${currentStep}/8`}
                </span>
              </div>

              {/* Progress bar */}
              {isInProgress && (
                <div className="mt-6">
                  <div className="flex items-center justify-between mb-2">
                    {STEP_LABELS.map((label, i) => {
                      const stepNum = i + 1;
                      const done = stepNum < currentStep;
                      const active = stepNum === currentStep;
                      return (
                        <div key={i} className="flex flex-col items-center flex-1">
                          <div
                            className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold transition-colors ${
                              done
                                ? "bg-violet-600 text-white"
                                : active
                                  ? "bg-violet-100 text-violet-700 ring-2 ring-violet-600"
                                  : "bg-gray-100 text-gray-500"
                            }`}
                          >
                            {done ? (
                              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                                <path d="M5 13l4 4L19 7" />
                              </svg>
                            ) : (
                              stepNum
                            )}
                          </div>
                          <span className="mt-1 text-[10px] text-gray-500 text-center leading-tight hidden sm:block">
                            {label}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Action buttons */}
              <div className="mt-8 flex flex-wrap gap-3">
                {isInProgress && (
                  <Link
                    href="/strategy/interview"
                    className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-6 py-3 text-sm font-semibold text-white shadow transition-all hover:bg-violet-700 hover:shadow-lg"
                  >
                    Resume Interview
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M5 12h14M12 5l7 7-7 7" />
                    </svg>
                  </Link>
                )}
                {isCompleted && (
                  <>
                    <Link
                      href="/strategy/interview"
                      className="inline-flex items-center gap-2 rounded-xl bg-gray-100 px-6 py-3 text-sm font-semibold text-gray-700 transition-all hover:bg-gray-200"
                    >
                      View Interview Responses
                    </Link>
                    {strategyDoc?.pdf_url && (
                      <a
                        href={strategyDoc.pdf_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-6 py-3 text-sm font-semibold text-white shadow transition-all hover:bg-violet-700 hover:shadow-lg"
                      >
                        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        View Strategy Document
                      </a>
                    )}
                    {strategyDoc?.share_token && (
                      <ShareStrategyButton shareToken={strategyDoc.share_token} />
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
