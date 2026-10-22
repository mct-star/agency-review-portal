"use client";

import type { ReactNode } from "react";
import { useIsAdmin } from "@/lib/use-is-admin";

/**
 * Setup pages that only AGENCY can save. Staff see the page; a client sees a
 * short note instead of controls that would fail.
 */
export default function AdminManagedGate({ children }: { children: ReactNode }) {
  const isAdmin = useIsAdmin();
  if (isAdmin === null) return null;
  if (isAdmin) return <>{children}</>;
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-600">
      AGENCY manages this for you. Email{" "}
      <a href="mailto:mct@agencybristol.com" className="font-medium text-blue-600 hover:underline">
        mct@agencybristol.com
      </a>{" "}
      to change it.
    </div>
  );
}
