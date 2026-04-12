import Link from "next/link";
import { createServerSupabaseClient, getUserProfile } from "@/lib/supabase/server";
import Badge from "@/components/ui/Badge";
import { formatWeekLabel } from "@/lib/utils/format-week-label";
import ReviewFilters from "@/components/review/ReviewFilters";
import InlineApproveButtons from "@/components/review/InlineApproveButtons";
import type { Week, Company } from "@/types/database";

export default async function WeeksPage() {
  const profile = await getUserProfile();
  if (!profile) return null;

  const supabase = await createServerSupabaseClient();
  const isAdmin = profile.role === "admin";

  let query = supabase
    .from("weeks")
    .select("*, company:companies(*)")
    .order("date_start", { ascending: true });

  if (!isAdmin && profile.company_id) {
    query = query.eq("company_id", profile.company_id);
  }

  const { data: weeks } = await query;

  // Split weeks into upcoming vs past based on date_start
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayIso = today.toISOString().slice(0, 10);

  const allWeeks = (weeks || []) as Array<Week & { company?: Company }>;

  const upcomingWeeks = allWeeks
    .filter((w) => w.date_start >= todayIso)
    .sort((a, b) => a.date_start.localeCompare(b.date_start)); // ascending: nearest first

  const pastWeeks = allWeeks
    .filter((w) => w.date_start < todayIso)
    .sort((a, b) => b.date_start.localeCompare(a.date_start)); // descending: most recent first

  // Fetch content piece counts for stat cards
  let piecesQuery = supabase
    .from("content_pieces")
    .select("approval_status");

  if (!isAdmin && profile.company_id) {
    piecesQuery = piecesQuery.eq("company_id", profile.company_id);
  }

  const { data: pieces } = await piecesQuery;

  const pendingCount = (pieces || []).filter(
    (p) => p.approval_status === "pending"
  ).length;
  const approvedCount = (pieces || []).filter(
    (p) => p.approval_status === "approved"
  ).length;
  const changesRequestedCount = (pieces || []).filter(
    (p) => p.approval_status === "changes_requested"
  ).length;

  // Individual posts (no week assignment)
  let individualQuery = supabase
    .from("content_pieces")
    .select("id, title, post_type, approval_status, created_at, markdown_body, company_id")
    .is("week_id", null)
    .in("approval_status", ["pending", "changes_requested"])
    .order("created_at", { ascending: false })
    .limit(20);
  if (!isAdmin && profile.company_id) {
    individualQuery = individualQuery.eq("company_id", profile.company_id);
  }
  const { data: individualPosts } = await individualQuery;

  // Count published pieces via publishing_jobs
  let publishedQuery = supabase
    .from("publishing_jobs")
    .select("id", { count: "exact", head: true })
    .eq("status", "published");

  if (!isAdmin && profile.company_id) {
    publishedQuery = publishedQuery.eq("company_id", profile.company_id);
  }

  const { count: publishedCount } = await publishedQuery;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Content Review</h1>
        <Link
          href="/generate"
          className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
        >
          Plan Next Week
        </Link>
      </div>

      {/* Stat Cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-medium text-amber-700">Pending Review</p>
          <p className="mt-1 text-2xl font-bold text-amber-900">
            {pendingCount + changesRequestedCount}
          </p>
        </div>
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <p className="text-sm font-medium text-emerald-700">Approved</p>
          <p className="mt-1 text-2xl font-bold text-emerald-900">
            {approvedCount}
          </p>
        </div>
        <div className="rounded-xl border border-sky-200 bg-sky-50 p-4">
          <p className="text-sm font-medium text-sky-700">Published</p>
          <p className="mt-1 text-2xl font-bold text-sky-900">
            {publishedCount ?? 0}
          </p>
        </div>
      </div>

      {/* Guidance banner */}
      <div className="rounded-xl border border-blue-200 bg-blue-50 px-5 py-4 flex items-start gap-3">
        <svg className="h-5 w-5 text-blue-500 mt-0.5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" />
          <path d="M12 16v-4M12 8h.01" />
        </svg>
        <div className="flex-1">
          <p className="text-sm font-medium text-blue-900">How review works</p>
          <p className="text-xs text-blue-700 mt-1">
            Posts appear here after generation. Review each one, then approve it to move it to Publish,
            or request changes to send it back for editing. Approved posts can be published to LinkedIn with one click.
          </p>
        </div>
      </div>

      {/* Search and Filters */}
      <ReviewFilters />

      {/* Individual Posts (no week assignment) */}
      {individualPosts && individualPosts.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-gray-900">
              Individual Posts
              <span className="ml-2 text-sm font-normal text-gray-400">{individualPosts.length}</span>
            </h2>
          </div>
          <div className="space-y-2">
            {individualPosts.map((post) => (
              <Link
                key={post.id}
                href={`/content/${post.id}`}
                className="flex items-center gap-4 rounded-xl border border-gray-200 bg-white px-5 py-4 shadow-sm hover:shadow-md transition-shadow"
              >
                {/* Status dot */}
                <div className={`h-2.5 w-2.5 rounded-full flex-shrink-0 ${
                  post.approval_status === "pending" ? "bg-amber-400" : "bg-red-400"
                }`} />

                {/* Post type badge */}
                <span className="rounded-md bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600">
                  {post.post_type?.replace(/_/g, " ") || "Post"}
                </span>

                {/* Title + preview */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{post.title || "Untitled post"}</p>
                  <p className="text-xs text-gray-400 truncate mt-0.5">
                    {post.markdown_body?.slice(0, 80).replace(/[#*_\n]/g, " ").trim() || ""}
                  </p>
                </div>

                {/* Date */}
                <span className="text-xs text-gray-400 flex-shrink-0">
                  {new Date(post.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                </span>

                {/* Inline actions or arrow */}
                {(post.approval_status === "pending" || post.approval_status === "changes_requested") ? (
                  <InlineApproveButtons pieceId={post.id} companyId={post.company_id} />
                ) : (
                  <svg className="h-4 w-4 text-gray-300 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                )}
              </Link>
            ))}
          </div>
        </section>
      )}

      {allWeeks.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 p-12 text-center">
          <p className="text-gray-500">No content weeks yet.</p>
        </div>
      ) : (
        <div className="space-y-10">
          {/* Upcoming Weeks */}
          <section>
            <div className="mb-4 flex items-baseline justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Upcoming Weeks</h2>
              {upcomingWeeks.length > 0 && (
                <span className="text-xs text-gray-400">
                  {upcomingWeeks.length} {upcomingWeeks.length === 1 ? "week" : "weeks"}
                </span>
              )}
            </div>

            {upcomingWeeks.length === 0 ? (
              <div className="rounded-xl border border-dashed border-gray-300 p-8 text-center">
                <p className="text-sm text-gray-500">No upcoming weeks planned.</p>
                <Link
                  href="/generate"
                  className="mt-3 inline-block text-sm font-medium text-sky-700 hover:text-sky-900"
                >
                  Plan next week →
                </Link>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {upcomingWeeks.map((week) => (
                  <WeekCard key={week.id} week={week} isAdmin={isAdmin} />
                ))}
              </div>
            )}
          </section>

          {/* Divider */}
          {pastWeeks.length > 0 && (
            <div className="border-t border-gray-200" />
          )}

          {/* Past Weeks */}
          {pastWeeks.length > 0 && (
            <section>
              <div className="mb-4 flex items-baseline justify-between">
                <h2 className="text-lg font-semibold text-gray-900">Past Weeks</h2>
                <span className="text-xs text-gray-400">
                  {pastWeeks.length} {pastWeeks.length === 1 ? "week" : "weeks"}
                </span>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {pastWeeks.map((week) => (
                  <WeekCard key={week.id} week={week} isAdmin={isAdmin} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

function WeekCard({
  week,
  isAdmin,
}: {
  week: Week & { company?: Company };
  isAdmin: boolean;
}) {
  const company = week.company as Company | undefined;

  return (
    <Link
      href={`/review/${week.id}`}
      className="group rounded-xl border border-gray-200 bg-white overflow-hidden transition-all hover:shadow-lg hover:border-gray-300"
    >
      {/* Brand bar — thicker, branded */}
      <div
        className="h-2"
        style={{ backgroundColor: company?.brand_color || "#e5e7eb" }}
      />

      {/* Company header — admin only, prominent */}
      {isAdmin && company && (
        <div className="flex items-center gap-3 border-b border-gray-100 px-5 py-3">
          {company.logo_url ? (
            <img
              src={company.logo_url}
              alt={company.name}
              className="h-8 w-8 rounded object-contain flex-shrink-0"
            />
          ) : (
            <div
              className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded text-sm font-bold text-white"
              style={{ backgroundColor: company.brand_color || "#94a3b8" }}
            >
              {company.name[0]}
            </div>
          )}
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-gray-800">
              {company.name}
            </p>
            {company.spokesperson_name && (
              <div className="flex items-center gap-1.5 mt-0.5">
                {company.profile_picture_url ? (
                  <img
                    src={company.profile_picture_url}
                    alt={company.spokesperson_name}
                    className="h-3.5 w-3.5 rounded-full object-cover flex-shrink-0"
                  />
                ) : null}
                <span className="truncate text-xs text-gray-400">
                  {company.spokesperson_name}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="p-5">
        {/* Week number + status */}
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-lg font-bold text-gray-900 group-hover:text-sky-700">
              {formatWeekLabel(week.date_start, week.week_number)}
            </h3>
            {week.title && (
              <p className="text-sm text-gray-600">{week.title}</p>
            )}
          </div>
          <Badge status={week.status} />
        </div>

        {/* Dates */}
        <div className="mt-3 text-xs text-gray-400">
          {week.date_start} — {week.date_end}
        </div>

        {(week.pillar || week.theme) && (
          <div className="mt-2 flex flex-wrap gap-1">
            {week.pillar && (
              <span className="rounded bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-600">
                {week.pillar}
              </span>
            )}
            {week.theme && (
              <span className="rounded bg-purple-50 px-2 py-0.5 text-[10px] font-medium text-purple-600">
                {week.theme}
              </span>
            )}
          </div>
        )}
      </div>
    </Link>
  );
}
