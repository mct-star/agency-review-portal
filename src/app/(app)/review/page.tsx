import Link from "next/link";
import { matchesReviewFilter } from "@/lib/utils/review-filter";
import { createServerSupabaseClient, getUserProfile } from "@/lib/supabase/server";
import Badge from "@/components/ui/Badge";
import { formatWeekLabel } from "@/lib/utils/format-week-label";
import ReviewFilters from "@/components/review/ReviewFilters";
import InlineApproveButtons from "@/components/review/InlineApproveButtons";
import type { Week, Company } from "@/types/database";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import WeekExport, { type WeekViewPost } from "@/components/hospitality/WeekExport";
import { longDateLabel, mondayOf, todayIn } from "@/lib/hospitality/week";
import { cleanDate, groupByDay, timeLabel, weekRangeLabel, weekWindow } from "@/lib/hospitality/week-view";

export const dynamic = "force-dynamic";

/**
 * A venue's week: approved and waiting posts day by day, and the download.
 * Only for a company user on the hospitality pack; everyone else gets the
 * business to business review page below.
 */
async function HospitalityWeek({ companyId, timezone, week }: { companyId: string; timezone: string; week: string | undefined }) {
  const today = todayIn(timezone);
  const w = weekWindow(cleanDate(week) || today);
  const supabase = await createAdminSupabaseClient();
  const { data: rows } = await supabase
    .from("content_pieces")
    .select("id, title, markdown_body, scheduled_date, scheduled_time, approval_status, week_id, updated_at")
    .eq("company_id", companyId)
    .eq("content_type", "social_post")
    .in("approval_status", ["approved", "pending"])
    .gte("scheduled_date", w.start)
    .lte("scheduled_date", w.end)
    .order("scheduled_date", { ascending: true })
    .order("scheduled_time", { ascending: true });
  const list = (rows || []) as Array<{ id: string; title: string; markdown_body: string | null; scheduled_date: string | null; scheduled_time: string | null; approval_status: string; week_id: string | null; updated_at: string | null }>;

  const approved = list.filter((r) => r.approval_status === "approved");
  const ids = approved.map((r) => r.id);
  const { data: images } = ids.length
    ? await supabase.from("content_images").select("content_piece_id, public_url, sort_order").in("content_piece_id", ids).order("sort_order")
    : { data: [] as Array<{ content_piece_id: string; public_url: string }> };
  const firstImage = new Map<string, string>();
  for (const i of images || []) if (!firstImage.has(i.content_piece_id)) firstImage.set(i.content_piece_id, i.public_url);

  const posts = list.map((r) => ({
    id: r.id,
    scheduled_date: r.scheduled_date,
    scheduled_time: r.scheduled_time,
    status: (r.approval_status === "approved" ? "approved" : "pending") as WeekViewPost["status"],
    title: r.title,
    caption: (r.markdown_body || "").trim(),
    time: timeLabel(r.scheduled_time),
    imageUrl: firstImage.get(r.id) || null,
    approvedOn: r.approval_status === "approved" && r.updated_at ? longDateLabel(todayIn(timezone, new Date(r.updated_at))) : null,
  }));
  const days = groupByDay(posts, w.dates, today);
  const weekIds = [...new Set(approved.map((r) => r.week_id).filter((id): id is string => !!id))];
  const isThisWeek = w.start === mondayOf(today);

  return (
    <WeekExport
      weekLabel={weekRangeLabel(w.start)}
      weekStart={w.start}
      previousHref={`/review?week=${w.previous}`}
      nextHref={`/review?week=${w.next}`}
      thisWeekHref={isThisWeek ? null : "/review"}
      days={days}
      weekIds={weekIds}
      approvedCount={approved.length}
      pendingCount={list.length - approved.length}
    />
  );
}

export default async function WeeksPage({ searchParams }: { searchParams: Promise<{ week?: string; status?: string; q?: string }> }) {
  const filters = await searchParams;
  const filter = ["pending", "approved", "changes_requested"].includes(filters.status || "") ? filters.status! : "";
  const search = filters.q || "";
  const profile = await getUserProfile();
  if (!profile) return null;

  const company = profile.company as { post_pack?: string | null; timezone?: string | null } | null | undefined;
  if (profile.role !== "admin" && profile.company_id && company?.post_pack === "hospitality") {
    const { week } = await searchParams;
    return <HospitalityWeek companyId={profile.company_id} timezone={company.timezone || "Europe/London"} week={week} />;
  }

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

  const visibleWeeks = allWeeks.filter(w => matchesReviewFilter(w.status, [w.title, w.company?.name, w.pillar, w.theme, w.date_start, formatWeekLabel(w.date_start, w.week_number)].filter(Boolean).join(" "), filter, search));
  const upcomingWeeks = visibleWeeks
    .filter((w) => w.date_start >= todayIso)
    .sort((a, b) => a.date_start.localeCompare(b.date_start)); // ascending: nearest first

  const pastWeeks = visibleWeeks
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
    .in("approval_status", filter ? [filter] : ["pending", "changes_requested", "approved"])
    .order("created_at", { ascending: false })
    .limit(20);
  if (!isAdmin && profile.company_id) {
    individualQuery = individualQuery.eq("company_id", profile.company_id);
  }
  const { data: recentPosts } = await individualQuery;
  const individualPosts = (recentPosts || []).filter(p => matchesReviewFilter(p.approval_status, `${p.title || ""} ${p.markdown_body || ""}`, filter, search));

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
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div>
          <p className="workspace-eyebrow">Review and refine</p>
          <h1 className="workspace-title">Content Review</h1>
          <p className="workspace-description">A fresh pair of eyes. Your final say on every post.</p>
        </div>
        <Link href="/generate" className="workspace-button workspace-button-secondary">Plan next week <span aria-hidden="true">↗</span></Link>
      </div>

      <dl className="workspace-summary workspace-panel">
        {[{ label: "Awaiting review", value: pendingCount + changesRequestedCount }, { label: "Approved", value: approvedCount }, { label: "Published", value: publishedCount ?? 0 }].map(stat => (
          <div key={stat.label}><dt className="text-xs text-gray-500 sm:text-sm">{stat.label}</dt><dd className="mt-2 text-3xl font-medium tabular-nums">{stat.value}</dd></div>
        ))}
      </dl>

      <details className="workspace-panel workspace-disclosure">
        <summary>How review works</summary>
        <p className="px-5 py-4 text-sm leading-6 text-gray-600">Open a draft to read it in full. Approve when it is ready, or request changes with your feedback. Approval records your decision. Publishing is a separate step.</p>
      </details>

      {/* Search and Filters */}
      <ReviewFilters />

      <p className="text-xs text-gray-500" role="status">{visibleWeeks.length} {visibleWeeks.length === 1 ? "week" : "weeks"} and {individualPosts.length} individual {individualPosts.length === 1 ? "post" : "posts"} shown. Search covers all weeks and the 20 most recent individual posts for the selected status.</p>
      {/* Individual posts (no week assignment) */}
      {individualPosts && individualPosts.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="workspace-section-title">
              Individual posts
              <span className="ml-2 text-sm font-normal text-gray-500">{individualPosts.length}</span>
            </h2>
          </div>
          <div className="space-y-2">
            {individualPosts.map((post) => (
              <article key={post.id} className="workspace-panel workspace-card workspace-review-row">
                <Link href={`/content/${post.id}`} className="min-w-0 flex-1 rounded-sm">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span className="text-xs text-gray-500">{post.post_type?.replace(/_/g, " ") || "Post"}</span>
                    <Badge status={post.approval_status} />
                  </div>
                  <h3 className="text-base font-medium text-gray-900 [overflow-wrap:anywhere]">{post.title || "Untitled post"}</h3>
                  <p className="mt-1 line-clamp-2 text-sm text-gray-500">{post.markdown_body?.slice(0, 160).replace(/[#*_\n]/g, " ").trim() || "Open this post to review its content."}</p>
                  <p className="mt-2 text-xs text-gray-500">{new Date(post.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })} <span className="ml-2 font-medium text-gray-700">Read post <span aria-hidden="true">↗</span></span></p>
                </Link>
                {(post.approval_status === "pending" || post.approval_status === "changes_requested") && <InlineApproveButtons pieceId={post.id} companyId={post.company_id} />}
              </article>
            ))}
          </div>
        </section>
      )}

      {visibleWeeks.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 p-12 text-center">
          <p className="text-base font-medium text-gray-900">{filter || search ? "No weeks match your filters." : "Your next week starts here."}</p>
          <p className="mt-2 text-sm text-gray-500">{filter || search ? "Clear the filters or try another search." : "Create a week of content and bring it here for review."}</p>
          {!filter && !search && <Link href="/generate" className="workspace-button workspace-button-secondary mt-5">Plan a week</Link>}
        </div>
      ) : (
        <div className="space-y-10">
          {/* Upcoming weeks */}
          <section>
            <div className="mb-4 flex items-baseline justify-between">
              <h2 className="workspace-section-title">Upcoming weeks</h2>
              {upcomingWeeks.length > 0 && (
                <span className="text-xs text-gray-500">
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

          {/* Past weeks */}
          {pastWeeks.length > 0 && (
            <section>
              <div className="mb-4 flex items-baseline justify-between">
                <h2 className="workspace-section-title">Past weeks</h2>
                <span className="text-xs text-gray-500">
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
      className="workspace-panel workspace-card group overflow-hidden"
    >
      {/* Brand bar — thicker, branded */}
      <div
        className="h-1"
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
                <span className="truncate text-xs text-gray-500">
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
            <h3 className="text-lg font-bold text-gray-900 group-hover:text-violet-800">
              {formatWeekLabel(week.date_start, week.week_number)}
            </h3>
            {week.title && (
              <p className="text-sm text-gray-600">{week.title}</p>
            )}
          </div>
          <Badge status={week.status} />
        </div>

        {/* Dates */}
        <div className="mt-3 text-xs text-gray-500">
          {new Date(week.date_start + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" })} to {new Date(week.date_end + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
        </div>

        {(week.pillar || week.theme) && (
          <div className="mt-2 flex flex-wrap gap-1">
            {week.pillar && (
              <span className="rounded bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                {week.pillar}
              </span>
            )}
            {week.theme && (
              <span className="rounded bg-purple-50 px-2 py-0.5 text-xs font-medium text-purple-600">
                {week.theme}
              </span>
            )}
          </div>
        )}
      </div>
    </Link>
  );
}
