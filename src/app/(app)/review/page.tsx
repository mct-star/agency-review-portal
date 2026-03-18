import Link from "next/link";
import { createServerSupabaseClient, getUserProfile } from "@/lib/supabase/server";
import Badge from "@/components/ui/Badge";
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Content Weeks</h1>
        {isAdmin && (
          <Link
            href="/admin/upload"
            className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
          >
            Create Week
          </Link>
        )}
      </div>

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
                {/* Brand bar */}
                <div
                  className="h-1.5"
                  style={{ backgroundColor: company?.brand_color || "#e5e7eb" }}
                />

                <div className="p-5">
                  {/* Week number + status */}
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="text-lg font-bold text-gray-900 group-hover:text-sky-700">
                        Week {week.week_number}
                      </h3>
                      {week.title && (
                        <p className="text-sm text-gray-600">{week.title}</p>
                      )}
                    </div>
                    <Badge status={week.status} />
                  </div>

                  {/* Company + person */}
                  {isAdmin && company && (
                    <div className="mt-3 flex items-center gap-2">
                      {company.logo_url ? (
                        <img
                          src={company.logo_url}
                          alt={company.name}
                          className="h-5 w-5 rounded object-contain"
                        />
                      ) : (
                        <div
                          className="flex h-5 w-5 items-center justify-center rounded text-[8px] font-bold text-white"
                          style={{ backgroundColor: company.brand_color || "#94a3b8" }}
                        >
                          {company.name[0]}
                        </div>
                      )}
                      <span className="text-sm text-gray-500">{company.name}</span>
                      {company.spokesperson_name && (
                        <>
                          <span className="text-gray-300">|</span>
                          <div className="flex items-center gap-1.5">
                            {company.profile_picture_url ? (
                              <img
                                src={company.profile_picture_url}
                                alt={company.spokesperson_name}
                                className="h-4 w-4 rounded-full object-cover"
                              />
                            ) : null}
                            <span className="text-xs text-gray-400">{company.spokesperson_name}</span>
                          </div>
                        </>
                      )}
                    </div>
                  )}

                  {/* Dates + pillar */}
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
