import Link from "next/link";
import { createServerSupabaseClient, getUserProfile } from "@/lib/supabase/server";
import Badge from "@/components/ui/Badge";
import { formatWeekLabel } from "@/lib/utils/format-week-label";
import ReviewFilters from "@/components/review/ReviewFilters";
import type { Week, Company } from "@/types/database";

export default async function WeeksPage() {
  const profile = await getUserProfile();
  if (!profile) return null;

  const supabase = await createServerSupabaseClient();
  const isAdmin = profile.role === "admin";

  let query = supabase
    .from("weeks")
    .select("*, company:companies(*)")
    .order("year", { ascending: false })
    .order("week_number", { ascending: false });

  if (!isAdmin && profile.company_id) {
    query = query.eq("company_id", profile.company_id);
  }

  const { data: weeks } = await query;

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
        {isAdmin && (
          <Link
            href="/admin/upload"
            className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
          >
            Create Week
          </Link>
        )}
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

      {/* Search and Filters */}
      <ReviewFilters />

      {(weeks || []).length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 p-12 text-center">
          <p className="text-gray-500">No content weeks yet.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {(weeks || []).map((week: Week & { company?: Company }) => {
            const company = week.company as Company | undefined;

            return (
              <Link
                key={week.id}
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
          })}
        </div>
      )}
    </div>
  );
}
