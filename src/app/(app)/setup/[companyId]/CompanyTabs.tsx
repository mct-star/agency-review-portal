"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface Tab {
  label: string;
  /** Relative to /setup/[companyId], unless `absolute` is set. */
  href: string;
  absolute?: boolean;
}

// Business-to-business tabs, ordered by tier: free, starter, pro, agency.
const B2B_TABS: Tab[] = [
  { label: "Overview", href: "" },
  { label: "People", href: "/people" },
  { label: "Sign-offs", href: "/signoffs" },
  { label: "URLs", href: "/urls" },
  { label: "Strategy", href: "/strategy" },
  { label: "Voice", href: "/voice" },
  { label: "Topics", href: "/topics" },
  { label: "Schedule", href: "/schedule" },
  { label: "Connections", href: "/social" },
  { label: "Brand style", href: "/brand-style" },
  { label: "Image mapping", href: "/image-mapping" },
  { label: "Blueprint", href: "/blueprint" },
  { label: "API Keys", href: "/api-keys" },
];

// A hospitality venue has no strategy, compliance or LinkedIn set-up: the
// venue page, its people and its photos are the whole of it.
const HOSPITALITY_TABS: Tab[] = [
  { label: "Overview", href: "" },
  { label: "Venue and posting", href: "/hospitality" },
  { label: "Connections", href: "/social" },
  { label: "People", href: "/people" },
  { label: "Photos", href: "/library", absolute: true },
];

export function tabsFor(postPack?: string | null): Tab[] {
  return postPack === "hospitality" ? HOSPITALITY_TABS : B2B_TABS;
}

interface CompanyTabsProps {
  companyId: string;
  /** The company's pack: `hospitality` gets the short venue tabs, anything else the B2B tabs. */
  postPack?: string | null;
}

export default function CompanyTabs({ companyId, postPack }: CompanyTabsProps) {
  const pathname = usePathname();
  const basePath = `/setup/${companyId}`;

  return (
    <div className="border-b border-gray-200">
      <nav className="-mb-px flex gap-4 overflow-x-auto">
        {tabsFor(postPack).map((tab) => {
          const fullHref = tab.absolute ? tab.href : basePath + tab.href;
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
