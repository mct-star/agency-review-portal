import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Company } from "@/types/database";

export default async function CompaniesPage() {
  const supabase = await createServerSupabaseClient();
  const { data: companies } = await supabase
    .from("companies")
    .select("*")
    .order("name");

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Companies</h1>

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Name
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Spokesperson
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Brand Color
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {(companies || []).map((company: Company) => (
              <tr key={company.id}>
                <td className="px-4 py-3 text-sm font-medium text-gray-900">
                  {company.name}
                </td>
                <td className="px-4 py-3 text-sm text-gray-500">
                  {company.spokesperson_name || "—"}
                </td>
                <td className="px-4 py-3">
                  {company.brand_color && (
                    <div className="flex items-center gap-2">
                      <span
                        className="inline-block h-4 w-4 rounded-full border border-gray-200"
                        style={{ backgroundColor: company.brand_color }}
                      />
                      <span className="text-xs text-gray-500">
                        {company.brand_color}
                      </span>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
