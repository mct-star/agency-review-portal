"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Sidebar, { type SidebarProps } from "./Sidebar";
import { DESKTOP_MIN_WIDTH_QUERY, OPEN_HELP_EVENT } from "@/components/chat/help-events";

/**
 * The app's navigation at every width.
 *
 * 768 px and up: the fixed 14rem sidebar, exactly as before.
 * Under 768 px: a top bar (menu button, AGENCY wordmark, Help) and the same
 * sidebar as a drawer that slides in over the content. The drawer closes on
 * any navigation, on a tap outside it, on Escape and on its close button.
 */
export default function ResponsiveSidebar(props: SidebarProps) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const menuButton = useRef<HTMLButtonElement>(null);
  const drawer = useRef<HTMLDivElement>(null);

  // Close on navigation.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    drawer.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        menuButton.current?.focus();
      }
    };
    // Turning the phone sideways (or widening the window) to desktop width closes the drawer.
    const media = window.matchMedia(DESKTOP_MIN_WIDTH_QUERY);
    const onWide = () => {
      if (media.matches) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    media.addEventListener("change", onWide);
    return () => {
      window.removeEventListener("keydown", onKey);
      media.removeEventListener("change", onWide);
    };
  }, [open]);

  return (
    <>
      {/* Phone top bar */}
      <header className="flex h-14 shrink-0 items-center gap-1 border-b border-gray-200 bg-white px-2 md:hidden">
        <button
          ref={menuButton}
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open menu"
          aria-expanded={open}
          aria-controls="phone-menu"
          className="flex h-11 w-11 items-center justify-center rounded-lg text-gray-700 hover:bg-gray-100"
        >
          <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M4 7h16M4 12h16M4 17h16" />
          </svg>
        </button>
        <Link href="/home" className="flex-1 px-1 text-base font-bold tracking-tight text-gray-900">
          AGENCY
        </Link>
        <button
          type="button"
          onClick={() => window.dispatchEvent(new Event(OPEN_HELP_EVENT))}
          aria-label="Help"
          className="flex h-11 w-11 items-center justify-center rounded-lg text-violet-700 hover:bg-violet-50"
        >
          <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="9" />
            <path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .9-1 1.7M12 17h.01" />
          </svg>
        </button>
      </header>

      {/* 768 px and up: the fixed sidebar */}
      <Sidebar {...props} className="hidden h-screen w-56 shrink-0 flex-col border-r border-gray-200 bg-white md:flex" />

      {/* Under 768 px: the drawer */}
      <div
        className={`fixed inset-0 z-40 transition-[visibility] duration-200 md:hidden ${open ? "visible" : "invisible pointer-events-none"}`}
      >
        <div
          className={`absolute inset-0 bg-gray-900/40 transition-opacity duration-200 ${open ? "opacity-100" : "opacity-0"}`}
          onClick={() => setOpen(false)}
          aria-hidden="true"
          data-testid="phone-menu-backdrop"
        />
        <div
          id="phone-menu"
          ref={drawer}
          role="dialog"
          aria-modal="true"
          aria-label="Menu"
          tabIndex={-1}
          inert={!open}
          onClick={(e) => {
            if ((e.target as HTMLElement).closest("a")) setOpen(false);
          }}
          className={`absolute inset-y-0 left-0 w-72 max-w-[85vw] bg-white shadow-xl outline-none transition-transform duration-200 ease-out ${
            open ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <Sidebar {...props} className="flex h-full w-full flex-col bg-white" />
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              menuButton.current?.focus();
            }}
            aria-label="Close menu"
            className="absolute right-2 top-2 flex h-10 w-10 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
      </div>
    </>
  );
}
