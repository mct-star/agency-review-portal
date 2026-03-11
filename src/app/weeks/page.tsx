import Link from "next/link";
import { createServerSupabaseClient, getUserProfile } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Badge from "@/components/ui/Badge";
import type { Week, Company } from "@/types/database";

export default async function WeeksPage() {
  const profile = await getUserProfile();
  if (!profile) return null; // Layout handles the "no profile" state

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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Content Weeks</h1>
        {isAdmin && (
          <Link
            href="/admin/upload"
            className="rounded-lg bg-sky-500 px-4 py-2 text-sm font-medium text-white hover:bg-sky-600"
          >
            Upload Week
          </Link>
        )}
      </div>

      {(weeks || []).length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 p-12 text-center">
          <p className="text-gray-500">No content weeks yet.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Week
                </th>
                {isAdmin && (
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Company
                  </th>
                )}
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Dates
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Pillar
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {(weeks || []).map((week: Week & { company?: Company }) => (
                <tr key={week.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <Link
                      href={`/weeks/${week.id}`}
                      className="font-medium text-sky-600 hover:text-sky-700"
                    >
                      Week {week.week_number}
                      {week.title && (
                        <span className="ml-2 text-gray-400">
                          {week.title}
                        </span>
                      )}
                    </Link>
                  </td>
                  {isAdmin && (
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {week.company ? (week.company as Company).name : "—"}
                    </td>
                  )}
                  <td className="px-4 py-3 text-sm text-gray-500">
                    {week.date_start} — {week.date_end}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">
                    {week.pillar || "—"}
                  </td>
                  <td className="px-4 py-3">
                    <Badge status={week.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
