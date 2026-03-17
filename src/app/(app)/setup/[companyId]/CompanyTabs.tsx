"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { label: "Overview", href: "" },
  { label: "Strategy", href: "/strategy" },
  { label: "Schedule", href: "/schedule" },
  { label: "Topics", href: "/topics" },
  { label: "Voice", href: "/voice" },
  { label: "Sign-offs", href: "/signoffs" },
  { label: "URLs", href: "/urls" },
  { label: "Blueprint", href: "/blueprint" },
  { label: "API Keys", href: "/api-keys" },
  { label: "Social", href: "/social" },
];

interface CompanyTabsProps {
  companyId: string;
}

export default function CompanyTabs({ companyId }: CompanyTabsProps) {
  const pathname = usePathname();
  const basePath = `/setup/${companyId}`;

  return (
    <div className="border-b border-gray-200">
      <nav className="-mb-px flex gap-4 overflow-x-auto">
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
