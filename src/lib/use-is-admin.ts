"use client";

import { useEffect, useState } from "react";

/**
 * Whether the signed-in user is AGENCY staff. `null` until /api/me answers,
 * so a page can wait rather than flash admin controls at a client.
 * A failed lookup counts as not an admin.
 */
export function useIsAdmin(): boolean | null {
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  useEffect(() => {
    let live = true;
    fetch("/api/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (live) setIsAdmin(j?.data?.role === "admin");
      })
      .catch(() => {
        if (live) setIsAdmin(false);
      });
    return () => {
      live = false;
    };
  }, []);
  return isAdmin;
}
