"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import type { User } from "@/types/database";

interface SidebarProps {
  user: User;
}

interface NavItem {
  href: string;
  label: string;
  icon: string;
  adminOnly?: boolean;
  highlight?: boolean;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

const sections: NavSection[] = [
  {
    title: "Setup",
    items: [
      { href: "/setup", label: "Companies", icon: "building", adminOnly: true },
    ],
  },
  {
    title: "Generate",
    items: [
      { href: "/generate", label: "Generate Week", icon: "sparkle", adminOnly: true, highlight: true },
    ],
  },
  {
    title: "Review",
    items: [
      { href: "/review", label: "Weeks", icon: "calendar" },
      { href: "/publish", label: "Publish", icon: "send", adminOnly: true },
    ],
  },
];

const icons: Record<string, string> = {
  grid: "M4 5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5Zm10 0a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1V5ZM4 15a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-4Zm10 0a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1v-4Z",
  calendar:
    "M6 2a1 1 0 0 0-1 1v1H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-1V3a1 1 0 1 0-2 0v1H7V3a1 1 0 0 0-1-1Zm0 6h12v10H6V8Z",
  building:
    "M4 3a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V3Zm4 3h2v2H8V6Zm6 0h-2v2h2V6ZM8 10h2v2H8v-2Zm6 0h-2v2h2v-2ZM8 14h2v2H8v-2Zm4 0h2v2h-2v-2Z",
  users:
    "M12 4a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM6 8a6 6 0 1 1 12 0A6 6 0 0 1 6 8Zm-2 12a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6 2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Z",
  sparkle:
    "M12 2L14.09 8.26L20 9.27L15.55 13.97L16.91 20L12 16.9L7.09 20L8.45 13.97L4 9.27L9.91 8.26L12 2Z",
  send: "M2.01 21L23 12 2.01 3 2 10l15 2-15 2z",
};

export default function Sidebar({ user }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const isAdmin = user.role === "admin";

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  }

  function isActive(href: string): boolean {
    if (pathname === href) return true;
    if (pathname.startsWith(href + "/")) return true;
    // /content/* pages are part of the Review section
    if (href === "/review" && pathname.startsWith("/content/")) return true;
    return false;
  }

  return (
    <aside className="flex h-screen w-56 flex-col border-r border-gray-200 bg-white">
      {/* Brand */}
      <div className="border-b border-gray-200 px-4 py-4">
        <h2 className="text-sm font-bold text-gray-900">AGENCY Bristol</h2>
        <p className="text-xs text-gray-500">Content Platform</p>
      </div>

      {/* Dashboard link */}
      <div className="px-2 pt-3 pb-1">
        <Link
          href="/dashboard"
          className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
            pathname === "/dashboard"
              ? "bg-sky-50 text-sky-700"
              : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
          }`}
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
            <path d={icons.grid} />
          </svg>
          Dashboard
        </Link>
      </div>

      {/* Sections */}
      <nav className="flex-1 space-y-4 overflow-y-auto px-2 py-2">
        {sections.map((section) => {
          const visibleItems = section.items.filter(
            (item) => !item.adminOnly || isAdmin
          );
          if (visibleItems.length === 0) return null;

          return (
            <div key={section.title}>
              <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                {section.title}
              </p>
              <div className="space-y-0.5">
                {visibleItems.map((item) => {
                  const active = isActive(item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                        active
                          ? "bg-sky-50 text-sky-700"
                          : item.highlight
                          ? "text-sky-600 hover:bg-sky-50 hover:text-sky-700"
                          : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                      }`}
                    >
                      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                        <path d={icons[item.icon]} />
                      </svg>
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>

      {/* Admin link */}
      {isAdmin && (
        <div className="border-t border-gray-100 px-2 py-1">
          <Link
            href="/users"
            className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              pathname === "/users"
                ? "bg-sky-50 text-sky-700"
                : "text-gray-400 hover:bg-gray-50 hover:text-gray-600"
            }`}
          >
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
              <path d={icons.users} />
            </svg>
            Users
          </Link>
        </div>
      )}

      {/* User info */}
      <div className="border-t border-gray-200 px-4 py-3">
        <p className="truncate text-sm font-medium text-gray-900">
          {user.full_name || user.email}
        </p>
        <p className="truncate text-xs text-gray-500">{user.email}</p>
        <button
          onClick={handleSignOut}
          className="mt-2 text-xs text-gray-400 hover:text-gray-600"
        >
          Sign out
        </button>
      </div>
    </aside>
  );
}
