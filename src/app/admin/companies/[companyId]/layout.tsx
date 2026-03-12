import { createServerSupabaseClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import type { Company } from "@/types/database";
import CompanyTabs from "./CompanyTabs";

interface LayoutProps {
  children: React.ReactNode;
  params: Promise<{ companyId: string }>;
}

export default async function CompanyDetailLayout({
  children,
  params,
}: LayoutProps) {
  const { companyId } = await params;
  const supabase = await createServerSupabaseClient();

  const { data: company } = await supabase
    .from("companies")
    .select("*")
    .eq("id", companyId)
    .single();

  if (!company) {
    notFound();
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          href="/admin/companies"
          className="text-sm text-gray-400 hover:text-gray-600"
        >
          ← Companies
        </Link>
        <span className="text-gray-300">/</span>
        <div className="flex items-center gap-2">
          {company.brand_color && (
            <span
              className="inline-block h-3 w-3 rounded-full border border-gray-200"
              style={{ backgroundColor: company.brand_color }}
            />
          )}
          <h1 className="text-2xl font-bold text-gray-900">{company.name}</h1>
        </div>
        {company.spokesperson_name && (
          <span className="text-sm text-gray-500">
            ({company.spokesperson_name})
          </span>
        )}
      </div>

      {/* Tabs */}
      <CompanyTabs companyId={companyId} />

      {/* Page content */}
      {children}
    </div>
  );
}
