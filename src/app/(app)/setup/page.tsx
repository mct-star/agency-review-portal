import { redirect } from "next/navigation";
import { createServerSupabaseClient, getUserProfile } from "@/lib/supabase/server";
import Link from "next/link";
import AddCompanyButton from "./AddCompanyButton";
import type { Company } from "@/types/database";

export default async function CompaniesPage() {
  const profile = await getUserProfile();
  if (!profile) redirect("/login");

  // Non-admin users should never see the companies grid
  if (profile.role !== "admin") {
    redirect(profile.company_id ? `/setup/${profile.company_id}` : "/dashboard");
  }

  const supabase = await createServerSupabaseClient();
  const { data: companies } = await supabase
    .from("companies")
    .select("*")
    .order("name");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Companies</h1>
        <AddCompanyButton />
      </div>

      {/* Company cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {(companies || []).map((company: Company) => {
          const initials = (company.spokesperson_name || company.name)
            .split(" ")
            .map((n: string) => n[0])
            .join("")
            .toUpperCase()
            .slice(0, 2);

          return (
            <Link
              key={company.id}
              href={`/setup/${company.id}`}
              className="group rounded-xl border border-gray-200 bg-white overflow-hidden transition-all hover:shadow-lg hover:border-gray-300"
            >
              {/* Brand bar */}
              <div className="h-1.5" style={{ backgroundColor: company.brand_color || "#e5e7eb" }} />

              <div className="p-5">
                <div className="flex items-start gap-4">
                  {/* Logo or initials */}
                  <div className="shrink-0">
                    {company.logo_url ? (
                      <img
                        src={company.logo_url}
                        alt={company.name}
                        className="h-12 w-12 rounded-lg object-contain border border-gray-100"
                      />
                    ) : (
                      <div
                        className="flex h-12 w-12 items-center justify-center rounded-lg text-sm font-bold text-white"
                        style={{ backgroundColor: company.brand_color || "#94a3b8" }}
                      >
                        {initials}
                      </div>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <h3 className="text-base font-bold text-gray-900 group-hover:text-sky-700">
                      {company.name}
                    </h3>
                    {company.spokesperson_name && (
                      <div className="mt-1 flex items-center gap-2">
                        {company.profile_picture_url ? (
                          <img
                            src={company.profile_picture_url}
                            alt={company.spokesperson_name}
                            className="h-5 w-5 rounded-full object-cover"
                          />
                        ) : (
                          <div
                            className="flex h-5 w-5 items-center justify-center rounded-full text-[8px] font-bold text-white"
                            style={{ backgroundColor: company.brand_color || "#94a3b8" }}
                          >
                            {company.spokesperson_name.split(" ").map((n: string) => n[0]).join("").slice(0, 2)}
                          </div>
                        )}
                        <span className="text-sm text-gray-500">{company.spokesperson_name}</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-400">{company.slug}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${
                      company.plan === "agency"
                        ? "bg-purple-100 text-purple-700"
                        : company.plan === "pro"
                        ? "bg-sky-100 text-sky-700"
                        : "bg-gray-100 text-gray-500"
                    }`}>
                      {company.plan || "free"}
                    </span>
                  </div>
                  <span className="text-xs font-medium text-sky-600 opacity-0 group-hover:opacity-100 transition-opacity">
                    Configure →
                  </span>
                </div>
              </div>
            </Link>
          );
        })}
      </div>

      {(!companies || companies.length === 0) && (
        <div className="rounded-xl border border-dashed border-gray-300 p-12 text-center">
          <p className="text-gray-500">No companies yet. Add your first company to get started.</p>
        </div>
      )}
    </div>
  );
}
