"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { sectionsFor } from "@/app/(app)/nav";
import type { User } from "@/types/database";

export default function WorkspaceHeader({ user, postPack }: { user: User; postPack: string }) {
  const pathname = usePathname();
  const entries = sectionsFor(user, postPack).flatMap(section => section.items.map(item => ({ ...item, section: section.title })));
  const current = entries.filter(item => pathname === item.href || pathname.startsWith(`${item.href}/`)).sort((a, b) => b.href.length - a.href.length)[0];
  const section = pathname.startsWith("/content/") ? "Review" : current?.section;
  const label = pathname === "/home" ? "Home" : pathname.startsWith("/content/") ? "Content detail" : current?.label || "Workspace";
  return (
    <div className="hidden min-h-[68px] items-center justify-between gap-4 border-b border-gray-200 px-8 text-sm md:flex">
      <nav aria-label="Breadcrumb" className="flex items-center gap-3 text-gray-500">
        <Link href="/home" className="hover:text-gray-900">Your workspace</Link>
        <span aria-hidden="true" className="text-gray-300">/</span>
        {section && <><span>{section}</span><span aria-hidden="true" className="text-gray-300">/</span></>}
        <span className="font-medium text-gray-900" aria-current="page">{label}</span>
      </nav>
      <Link href="/notifications" className="workspace-button workspace-button-quiet">
        <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></svg>
        Notifications
      </Link>
    </div>
  );
}
