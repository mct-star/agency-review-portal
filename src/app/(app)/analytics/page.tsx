import type { Metadata } from "next";
import { createServerSupabaseClient, getUserProfile } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import PollButton from "./PollButton";

export const metadata: Metadata = {
  title: "Analytics | AGENCY",
  description: "Track your content performance",
};

interface AnalyticsRow {
  id: string;
  content_piece_id: string | null;
  publishing_job_id: string | null;
  platform: string;
  external_post_id: string | null;
  impressions: number;
  likes: number;
  comments: number;
  shares: number;
  clicks: number;
  engagement_rate: number;
  post_type: string | null;
  day_of_week: string | null;
  posted_at: string | null;
  last_polled_at: string | null;
  poll_count: number;
  content_pieces?: { title: string; content_type: string; post_type: string | null } | null;
}

export default async function AnalyticsPage() {
  const profile = await getUserProfile();
  if (!profile) redirect("/login");

  const supabase = await createServerSupabaseClient();

  // Fetch analytics data
  const query = supabase
    .from("post_analytics")
    .select("*, content_pieces(title, content_type, post_type)")
    .order("posted_at", { ascending: false })
    .limit(100);

  // Non-admin users only see their own company
  if (profile.role !== "admin" && profile.company_id) {
    query.eq("company_id", profile.company_id);
  }

  const { data: analytics } = await query;
  const rows = (analytics || []) as AnalyticsRow[];

  // Calculate summary stats
  const totalPosts = rows.length;
  const avgEngagement =
    totalPosts > 0
      ? rows.reduce((sum, r) => sum + (r.engagement_rate || 0), 0) / totalPosts
      : 0;

  // Best post type
  const postTypeStats = new Map<string, { total: number; count: number }>();
  for (const row of rows) {
    const pt = row.post_type || row.content_pieces?.post_type || row.content_pieces?.content_type || "unknown";
    const existing = postTypeStats.get(pt) || { total: 0, count: 0 };
    existing.total += row.likes + row.comments + row.shares;
    existing.count += 1;
    postTypeStats.set(pt, existing);
  }

  let bestPostType = "N/A";
  let bestPostTypeAvg = 0;
  for (const [pt, stats] of postTypeStats) {
    const avg = stats.count > 0 ? stats.total / stats.count : 0;
    if (avg > bestPostTypeAvg) {
      bestPostTypeAvg = avg;
      bestPostType = pt;
    }
  }

  // Best day of week
  const dayStats = new Map<string, { total: number; count: number }>();
  for (const row of rows) {
    if (!row.day_of_week) continue;
    const existing = dayStats.get(row.day_of_week) || { total: 0, count: 0 };
    existing.total += row.likes + row.comments + row.shares;
    existing.count += 1;
    dayStats.set(row.day_of_week, existing);
  }

  let bestDay = "N/A";
  let bestDayAvg = 0;
  for (const [day, stats] of dayStats) {
    const avg = stats.count > 0 ? stats.total / stats.count : 0;
    if (avg > bestDayAvg) {
      bestDayAvg = avg;
      bestDay = day;
    }
  }

  // Post type breakdown for bar chart
  const postTypeBreakdown = Array.from(postTypeStats.entries())
    .map(([name, stats]) => ({
      name: formatLabel(name),
      avgEngagement: stats.count > 0 ? stats.total / stats.count : 0,
      count: stats.count,
    }))
    .sort((a, b) => b.avgEngagement - a.avgEngagement);

  const maxPostTypeEngagement = Math.max(
    ...postTypeBreakdown.map((p) => p.avgEngagement),
    1
  );

  // Day of week breakdown
  const dayOrder = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  const dayBreakdown = dayOrder
    .map((day) => {
      const stats = dayStats.get(day);
      return {
        name: day,
        avgEngagement: stats && stats.count > 0 ? stats.total / stats.count : 0,
        count: stats?.count || 0,
      };
    })
    .filter((d) => d.count > 0);

  const maxDayEngagement = Math.max(
    ...dayBreakdown.map((d) => d.avgEngagement),
    1
  );

  const isAdmin = profile.role === "admin";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Analytics</h1>
          <p className="mt-1 text-sm text-gray-500">
            Track engagement metrics for your published LinkedIn content
          </p>
        </div>
        {isAdmin && <PollButton />}
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard
          label="Posts Tracked"
          value={totalPosts.toString()}
          sublabel="with analytics"
        />
        <SummaryCard
          label="Avg Engagement Rate"
          value={`${avgEngagement.toFixed(1)}%`}
          sublabel="across all posts"
        />
        <SummaryCard
          label="Best Post Type"
          value={formatLabel(bestPostType)}
          sublabel={bestPostTypeAvg > 0 ? `${bestPostTypeAvg.toFixed(1)} avg interactions` : ""}
        />
        <SummaryCard
          label="Best Day"
          value={bestDay}
          sublabel={bestDayAvg > 0 ? `${bestDayAvg.toFixed(1)} avg interactions` : ""}
        />
      </div>

      {/* Post Type Breakdown */}
      {postTypeBreakdown.length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white p-6">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">
            Performance by Post Type
          </h2>
          <div className="space-y-3">
            {postTypeBreakdown.map((pt) => (
              <div key={pt.name} className="flex items-center gap-3">
                <span className="w-36 shrink-0 text-sm text-gray-600 truncate">
                  {pt.name}
                </span>
                <div className="flex-1">
                  <div className="h-6 rounded-full bg-gray-100 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-emerald-500 transition-all"
                      style={{
                        width: `${(pt.avgEngagement / maxPostTypeEngagement) * 100}%`,
                      }}
                    />
                  </div>
                </div>
                <span className="w-20 shrink-0 text-right text-sm font-medium text-gray-900">
                  {pt.avgEngagement.toFixed(1)} avg
                </span>
                <span className="w-16 shrink-0 text-right text-xs text-gray-400">
                  {pt.count} post{pt.count !== 1 ? "s" : ""}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Day of Week Breakdown */}
      {dayBreakdown.length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white p-6">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">
            Performance by Day of Week
          </h2>
          <div className="space-y-3">
            {dayBreakdown.map((d) => (
              <div key={d.name} className="flex items-center gap-3">
                <span className="w-24 shrink-0 text-sm text-gray-600">
                  {d.name}
                </span>
                <div className="flex-1">
                  <div className="h-6 rounded-full bg-gray-100 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-emerald-400 transition-all"
                      style={{
                        width: `${(d.avgEngagement / maxDayEngagement) * 100}%`,
                      }}
                    />
                  </div>
                </div>
                <span className="w-20 shrink-0 text-right text-sm font-medium text-gray-900">
                  {d.avgEngagement.toFixed(1)} avg
                </span>
                <span className="w-16 shrink-0 text-right text-xs text-gray-400">
                  {d.count} post{d.count !== 1 ? "s" : ""}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Performance Table */}
      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        <div className="border-b border-gray-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-900">
            Recent Post Performance
          </h2>
        </div>
        {rows.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <p className="text-sm text-gray-500">
              No analytics data yet. Publish posts to LinkedIn and poll for metrics.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="px-6 py-3 font-medium text-gray-500">Post</th>
                  <th className="px-4 py-3 font-medium text-gray-500 text-right">Likes</th>
                  <th className="px-4 py-3 font-medium text-gray-500 text-right">Comments</th>
                  <th className="px-4 py-3 font-medium text-gray-500 text-right">Shares</th>
                  <th className="px-4 py-3 font-medium text-gray-500 text-right">Engagement</th>
                  <th className="px-4 py-3 font-medium text-gray-500">Day</th>
                  <th className="px-4 py-3 font-medium text-gray-500">Published</th>
                  <th className="px-4 py-3 font-medium text-gray-500 text-right">Polls</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((row) => {
                  const title =
                    row.content_pieces?.title ||
                    (row.external_post_id
                      ? `Post ${row.external_post_id.slice(-8)}`
                      : "Untitled");
                  const totalInteractions = row.likes + row.comments + row.shares;

                  return (
                    <tr key={row.id} className="hover:bg-gray-50">
                      <td className="px-6 py-3 max-w-xs truncate font-medium text-gray-900">
                        {title}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-gray-700">
                        {row.likes}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-gray-700">
                        {row.comments}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-gray-700">
                        {row.shares}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                            totalInteractions >= 20
                              ? "bg-emerald-100 text-emerald-700"
                              : totalInteractions >= 5
                              ? "bg-amber-100 text-amber-700"
                              : "bg-gray-100 text-gray-600"
                          }`}
                        >
                          {totalInteractions}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-500">
                        {row.day_of_week ? row.day_of_week.slice(0, 3) : "-"}
                      </td>
                      <td className="px-4 py-3 text-gray-500">
                        {row.posted_at
                          ? new Date(row.posted_at).toLocaleDateString("en-GB", {
                              day: "numeric",
                              month: "short",
                            })
                          : "-"}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-400 tabular-nums">
                        {row.poll_count}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  sublabel,
}: {
  label: string;
  value: string;
  sublabel: string;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <p className="text-xs font-medium uppercase tracking-wider text-gray-400">
        {label}
      </p>
      <p className="mt-2 text-2xl font-bold text-gray-900">{value}</p>
      {sublabel && (
        <p className="mt-1 text-xs text-gray-500">{sublabel}</p>
      )}
    </div>
  );
}

function formatLabel(slug: string): string {
  return slug
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
