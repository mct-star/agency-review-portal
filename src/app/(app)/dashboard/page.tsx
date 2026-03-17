import Link from "next/link";
import { createServerSupabaseClient, getUserProfile } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Badge from "@/components/ui/Badge";
import type { Week, Company, Notification } from "@/types/database";

export default async function DashboardPage() {
  const profile = await getUserProfile();
  if (!profile) return null; // Layout handles the "no profile" state

  const supabase = await createServerSupabaseClient();
  const isAdmin = profile.role === "admin";

  // Fetch weeks with company info
  let weeksQuery = supabase
    .from("weeks")
    .select("*, company:companies(*)")
    .order("year", { ascending: false })
    .order("week_number", { ascending: false })
    .limit(6);

  if (!isAdmin && profile.company_id) {
    weeksQuery = weeksQuery.eq("company_id", profile.company_id);
  }

  const { data: weeks } = await weeksQuery;

  // Fetch unread notifications
  const { data: notifications } = await supabase
    .from("notifications")
    .select("*")
    .eq("recipient_user_id", profile.id)
    .eq("read", false)
    .order("created_at", { ascending: false })
    .limit(10);

  // For each week, get approval progress
  const weekIds = (weeks || []).map((w: Week) => w.id);
  const { data: pieces } = weekIds.length
    ? await supabase
        .from("content_pieces")
        .select("week_id, approval_status")
        .in("week_id", weekIds)
    : { data: [] };

  const progressByWeek: Record<string, { total: number; approved: number; changes: number }> = {};
  for (const piece of pieces || []) {
    if (!progressByWeek[piece.week_id]) {
      progressByWeek[piece.week_id] = { total: 0, approved: 0, changes: 0 };
    }
    progressByWeek[piece.week_id].total++;
    if (piece.approval_status === "approved") progressByWeek[piece.week_id].approved++;
    if (piece.approval_status === "changes_requested") progressByWeek[piece.week_id].changes++;
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          {isAdmin ? "Admin Dashboard" : "Content Review"}
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          {isAdmin
            ? "Overview of all client content"
            : `Welcome back, ${profile.full_name || profile.email}`}
        </p>
      </div>

      {/* Notifications */}
      {(notifications || []).length > 0 && (
        <div className="rounded-lg border border-sky-200 bg-sky-50 p-4">
          <h2 className="text-sm font-semibold text-sky-800">
            {notifications!.length} unread notification{notifications!.length !== 1 ? "s" : ""}
          </h2>
          <ul className="mt-2 space-y-1">
            {notifications!.slice(0, 3).map((n: Notification) => (
              <li key={n.id} className="text-sm text-sky-700">
                {n.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Recent Weeks */}
      <div>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Recent Weeks</h2>
          <Link
            href="/review"
            className="text-sm text-sky-600 hover:text-sky-700"
          >
            View all
          </Link>
        </div>

        {(weeks || []).length === 0 ? (
          <div className="rounded-lg border border-dashed border-gray-300 p-8 text-center">
            <p className="text-sm text-gray-500">No content weeks yet.</p>
            {isAdmin && (
              <Link
                href="/admin/upload"
                className="mt-2 inline-block text-sm font-medium text-sky-600 hover:text-sky-700"
              >
                Upload your first week
              </Link>
            )}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {(weeks || []).map((week: Week & { company?: Company }) => {
              const progress = progressByWeek[week.id];
              return (
                <Link
                  key={week.id}
                  href={`/review/${week.id}`}
                  className="block rounded-lg border border-gray-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm font-semibold text-gray-900">
                        Week {week.week_number}
                      </p>
                      {week.title && (
                        <p className="text-xs text-gray-500">{week.title}</p>
                      )}
                    </div>
                    <Badge status={week.status} />
                  </div>

                  {isAdmin && week.company && (
                    <p className="mt-1 text-xs text-gray-400">
                      {(week.company as Company).name}
                    </p>
                  )}

                  <p className="mt-2 text-xs text-gray-500">
                    {week.date_start} — {week.date_end}
                  </p>

                  {progress && (
                    <div className="mt-3">
                      <div className="flex justify-between text-xs text-gray-500">
                        <span>{progress.approved}/{progress.total} approved</span>
                        {progress.changes > 0 && (
                          <span className="text-amber-600">
                            {progress.changes} need changes
                          </span>
                        )}
                      </div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-gray-100">
                        <div
                          className="h-full rounded-full bg-green-500 transition-all"
                          style={{
                            width: `${progress.total ? (progress.approved / progress.total) * 100 : 0}%`,
                          }}
                        />
                      </div>
                    </div>
                  )}

                  {week.pillar && (
                    <div className="mt-2 flex gap-1">
                      <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-600">
                        {week.pillar}
                      </span>
                      {week.theme && (
                        <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-600">
                          {week.theme}
                        </span>
                      )}
                    </div>
                  )}
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
