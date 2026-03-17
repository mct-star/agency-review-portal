import { createServerSupabaseClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import Link from "next/link";

interface PageProps {
  params: Promise<{ companyId: string }>;
}

export default async function CompanyOverviewPage({ params }: PageProps) {
  const { companyId } = await params;
  const supabase = await createServerSupabaseClient();

  const { data: company } = await supabase
    .from("companies")
    .select("*")
    .eq("id", companyId)
    .single();

  if (!company) notFound();

  // Fetch summary counts
  const [
    { count: apiConfigCount },
    { count: socialCount },
    { count: blueprintCount },
    { count: topicCount },
    { count: weekCount },
    { count: pieceCount },
  ] = await Promise.all([
    supabase
      .from("company_api_configs")
      .select("*", { count: "exact", head: true })
      .eq("company_id", companyId),
    supabase
      .from("company_social_accounts")
      .select("*", { count: "exact", head: true })
      .eq("company_id", companyId),
    supabase
      .from("company_blueprints")
      .select("*", { count: "exact", head: true })
      .eq("company_id", companyId)
      .eq("is_active", true),
    supabase
      .from("topic_bank")
      .select("*", { count: "exact", head: true })
      .eq("company_id", companyId),
    supabase
      .from("weeks")
      .select("*", { count: "exact", head: true })
      .eq("company_id", companyId),
    supabase
      .from("content_pieces")
      .select("*", { count: "exact", head: true })
      .eq("company_id", companyId),
  ]);

  const stats = [
    { label: "API Providers", value: apiConfigCount || 0, href: "api-providers" },
    { label: "Social Accounts", value: socialCount || 0, href: "social-accounts" },
    { label: "Blueprint", value: blueprintCount || 0 > 0 ? "Active" : "None", href: "blueprint" },
    { label: "Topics", value: topicCount || 0, href: "topic-bank" },
    { label: "Posting Schedule", value: "Configure", href: "posting-schedule" },
    { label: "Weeks", value: weekCount || 0, href: null },
    { label: "Content Pieces", value: pieceCount || 0, href: null },
  ];

  return (
    <div className="space-y-6">
      {/* Company Details */}
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-gray-900">Company Details</h2>
        <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
          <div>
            <dt className="text-xs font-medium uppercase text-gray-500">Name</dt>
            <dd className="mt-1 text-sm text-gray-900">{company.name}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase text-gray-500">Slug</dt>
            <dd className="mt-1 text-sm text-gray-900">{company.slug}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase text-gray-500">
              Spokesperson
            </dt>
            <dd className="mt-1 text-sm text-gray-900">
              {company.spokesperson_name || "—"}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase text-gray-500">
              Brand Color
            </dt>
            <dd className="mt-1 flex items-center gap-2 text-sm text-gray-900">
              {company.brand_color ? (
                <>
                  <span
                    className="inline-block h-4 w-4 rounded-full border border-gray-200"
                    style={{ backgroundColor: company.brand_color }}
                  />
                  {company.brand_color}
                </>
              ) : (
                "—"
              )}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase text-gray-500">ID</dt>
            <dd className="mt-1 font-mono text-xs text-gray-400">
              {company.id}
            </dd>
          </div>
        </dl>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-7">
        {stats.map((stat) => {
          const content = (
            <>
              <p className="text-xs font-medium uppercase text-gray-500">
                {stat.label}
              </p>
              <p className="mt-1 text-2xl font-bold text-gray-900">
                {stat.value}
              </p>
            </>
          );

          if (stat.href) {
            return (
              <Link
                key={stat.label}
                href={`/admin/companies/${companyId}/${stat.href}`}
                className="rounded-lg border border-gray-200 bg-white p-4 transition-colors hover:border-sky-300 hover:bg-sky-50/50"
              >
                {content}
              </Link>
            );
          }

          return (
            <div
              key={stat.label}
              className="rounded-lg border border-gray-200 bg-white p-4"
            >
              {content}
            </div>
          );
        })}
      </div>
    </div>
  );
}
