import Link from "next/link";
import { createServerSupabaseClient, getUserProfile } from "@/lib/supabase/server";
import BulkGenerateButton from "@/components/generate/BulkGenerateButton";

/**
 * Content Studio — Plan and generate a full week or month of content.
 *
 * This is the "slower, strategic" complement to Quick Generate:
 * - Quick Generate: one post in 30 seconds
 * - Content Studio: a full week's ecosystem in 10 minutes
 *
 * Shows the user's posting schedule, topic suggestions from their
 * strategy, and lets them generate all posts at once.
 */

export default async function ContentStudioPage() {
  const profile = await getUserProfile();
  if (!profile) return null;

  const supabase = await createServerSupabaseClient();
  const companyId = profile.company_id;

  if (!companyId) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-center">
          <h1 className="text-xl font-bold text-gray-900">No company set up</h1>
          <p className="mt-2 text-sm text-gray-500">Complete your setup first to start creating content.</p>
          <Link href="/dashboard" className="mt-4 inline-block text-sm font-medium text-violet-600 hover:text-violet-700">
            Go to dashboard
          </Link>
        </div>
      </div>
    );
  }

  // Fetch company + schedule
  const [
    { data: company },
    { data: slots },
    { data: topics },
    { data: primaryPerson },
  ] = await Promise.all([
    supabase.from("companies").select("name, brand_color, spokesperson_name").eq("id", companyId).single(),
    supabase.from("posting_slots").select("*").eq("company_id", companyId).eq("is_active", true).order("sort_order"),
    supabase.from("company_topics").select("id, topic, pillar, theme, topic_number").eq("company_id", companyId).eq("used", false).order("topic_number").limit(20),
    supabase.from("company_spokespersons").select("id").eq("company_id", companyId).eq("is_primary", true).limit(1).single(),
  ]);
  const primarySpokespersonId = primaryPerson?.id || null;

  const brandColor = company?.brand_color || "#7c3aed";
  const hasSchedule = slots && slots.length > 0;
  const hasTopics = topics && topics.length > 0;

  // Get current week info
  const now = new Date();
  const dayOfWeek = now.getDay();
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const weekStart = new Date(now);
  weekStart.setDate(weekStart.getDate() + mondayOffset);
  const nextWeekStart = new Date(weekStart);
  nextWeekStart.setDate(nextWeekStart.getDate() + 7);

  const formatDate = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  const thisWeekLabel = `${formatDate(weekStart)} — ${formatDate(new Date(weekStart.getTime() + 6 * 86400000))}`;
  const nextWeekLabel = `${formatDate(nextWeekStart)} — ${formatDate(new Date(nextWeekStart.getTime() + 6 * 86400000))}`;

  // Day display names
  const dayNames: Record<string, string> = {
    monday: "Monday", tuesday: "Tuesday", wednesday: "Wednesday",
    thursday: "Thursday", friday: "Friday", saturday: "Saturday", sunday: "Sunday",
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Content Studio</h1>
            <p className="mt-1 text-sm text-gray-500">
              Plan and generate a full week of strategic, interconnected content.
            </p>
          </div>
          <Link
            href="/generate/quick"
            className="rounded-lg border border-gray-200 px-4 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors"
          >
            Quick Generate instead
          </Link>
        </div>
      </div>

      {/* Week selector */}
      <div className="grid gap-4 sm:grid-cols-2">
        <button className="rounded-2xl border-2 border-violet-300 bg-violet-50 p-5 text-left transition-all hover:shadow-md">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-100 text-violet-600">
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-bold text-gray-900">This Week</p>
              <p className="text-xs text-gray-500">{thisWeekLabel}</p>
            </div>
          </div>
        </button>
        <button className="rounded-2xl border border-gray-200 bg-white p-5 text-left transition-all hover:shadow-md hover:border-gray-300">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gray-100 text-gray-500">
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-bold text-gray-900">Next Week</p>
              <p className="text-xs text-gray-500">{nextWeekLabel}</p>
            </div>
          </div>
        </button>
      </div>

      {/* Schedule + Topics layout */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left: Posting Schedule (2 cols) */}
        <div className="lg:col-span-2 space-y-4">
          <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="text-base font-bold text-gray-900">Posting Schedule</h2>
            <p className="mt-1 text-xs text-gray-400">
              {hasSchedule
                ? `${slots!.length} posting slot${slots!.length !== 1 ? "s" : ""} configured. Generate content for each slot.`
                : "No schedule configured yet."}
            </p>

            {hasSchedule ? (
              <div className="mt-4 space-y-3">
                {slots!.map((slot: { id: string; day_of_week: string; time_slot: string; post_type: string; label?: string }) => (
                  <div
                    key={slot.id}
                    className="flex items-center justify-between rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 transition-colors hover:bg-gray-100"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-xs font-bold text-white"
                        style={{ backgroundColor: brandColor }}
                      >
                        {(dayNames[slot.day_of_week] || slot.day_of_week).slice(0, 2)}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-gray-900">
                          {dayNames[slot.day_of_week] || slot.day_of_week} {slot.time_slot && `— ${slot.time_slot}`}
                        </p>
                        <p className="text-xs text-gray-500">
                          {slot.label || slot.post_type?.replace(/_/g, " ") || "Post"}
                        </p>
                      </div>
                    </div>
                    <Link
                      href={`/generate/quick?postType=${slot.post_type || ""}`}
                      className="rounded-lg px-3 py-1.5 text-xs font-medium text-white transition-colors hover:opacity-90"
                      style={{ backgroundColor: brandColor }}
                    >
                      Generate
                    </Link>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-4 rounded-xl border border-dashed border-gray-300 bg-gray-50 p-6 text-center">
                <p className="text-sm text-gray-500">Set up your posting schedule to see slots here.</p>
                <Link
                  href={`/setup/${companyId}/schedule`}
                  className="mt-2 inline-block text-xs font-medium text-violet-600 hover:text-violet-700"
                >
                  Configure schedule
                </Link>
              </div>
            )}

            {hasSchedule && (
              <div className="mt-4 pt-4 border-t border-gray-100">
                <BulkGenerateButton
                  companyId={companyId}
                  spokespersonId={primarySpokespersonId || undefined}
                  slots={slots!.map((s: { id: string; day_of_week: string; time_slot: string; post_type: string; label?: string }) => ({
                    id: s.id,
                    day_of_week: s.day_of_week,
                    time_slot: s.time_slot,
                    post_type: s.post_type,
                    label: s.label,
                  }))}
                  brandColor={brandColor}
                  weekLabel="This Week"
                />
              </div>
            )}
          </div>
        </div>

        {/* Right: Topic suggestions */}
        <div className="space-y-4">
          <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="text-base font-bold text-gray-900">Topic Ideas</h2>
            <p className="mt-1 text-xs text-gray-400">
              {hasTopics
                ? `${topics!.length} unused topics from your strategy.`
                : "No topics configured."}
            </p>

            {hasTopics ? (
              <div className="mt-4 space-y-2">
                {topics!.slice(0, 8).map((t: { id: string; topic: string; pillar?: string; theme?: string }) => (
                  <Link
                    key={t.id}
                    href={`/generate/quick?topic=${encodeURIComponent(t.topic)}`}
                    className="block rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-xs text-gray-700 transition-colors hover:bg-violet-50 hover:border-violet-200 hover:text-violet-700"
                  >
                    <span className="font-medium">{t.topic}</span>
                    {(t.pillar || t.theme) && (
                      <span className="ml-2 text-[10px] text-gray-400">
                        {[t.pillar, t.theme].filter(Boolean).join(" / ")}
                      </span>
                    )}
                  </Link>
                ))}
              </div>
            ) : (
              <div className="mt-4 text-center">
                <p className="text-xs text-gray-400">Upload your content strategy to get topic suggestions.</p>
                <Link
                  href={`/setup/${companyId}/topics`}
                  className="mt-2 inline-block text-xs font-medium text-violet-600"
                >
                  Add topics
                </Link>
              </div>
            )}
          </div>

          {/* Quick links */}
          <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
            <h3 className="text-xs font-semibold uppercase text-gray-400 mb-3">Quick Links</h3>
            <div className="space-y-1">
              <Link href="/calendar" className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs text-gray-600 hover:bg-gray-50 transition-colors">
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                Content Calendar
              </Link>
              <Link href="/content" className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs text-gray-600 hover:bg-gray-50 transition-colors">
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 12l2 2 4-4" /><circle cx="12" cy="12" r="10" /></svg>
                Review Content
              </Link>
              <Link href={`/setup/${companyId}/schedule`} className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs text-gray-600 hover:bg-gray-50 transition-colors">
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                Edit Schedule
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
