"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { label: "Overview", href: "" },
  { label: "API Providers", href: "/api-providers" },
  { label: "Social Accounts", href: "/social-accounts" },
  { label: "Blueprint", href: "/blueprint" },
  { label: "Topic Bank", href: "/topic-bank" },
];

interface CompanyTabsProps {
  companyId: string;
}

export default function CompanyTabs({ companyId }: CompanyTabsProps) {
  const pathname = usePathname();
  const basePath = `/admin/companies/${companyId}`;

  return (
    <div className="border-b border-gray-200">
      <nav className="-mb-px flex gap-6">
        {tabs.map((tab) => {
          const fullHref = basePath + tab.href;
          const isActive =
            tab.href === ""
              ? pathname === basePath
              : pathname.startsWith(fullHref);

          return (
            <Link
              key={tab.label}
              href={fullHref}
              className={`whitespace-nowrap border-b-2 px-1 pb-3 text-sm font-medium transition-colors ${
                isActive
                  ? "border-sky-500 text-sky-600"
                  : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700"
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
