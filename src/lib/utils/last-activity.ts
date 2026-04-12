"use client";

interface LastActivity {
  type: "post" | "strategy" | "review";
  label: string;
  href: string;
  timestamp: number;
}

const STORAGE_KEY = "agency:lastActivity";

export function setLastActivity(activity: Omit<LastActivity, "timestamp">) {
  if (typeof window === "undefined") return;
  const data: LastActivity = { ...activity, timestamp: Date.now() };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export function getLastActivity(): LastActivity | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as LastActivity;
    // Only show if less than 24 hours old
    if (Date.now() - data.timestamp > 24 * 60 * 60 * 1000) return null;
    return data;
  } catch {
    return null;
  }
}

export function clearLastActivity() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(STORAGE_KEY);
}
