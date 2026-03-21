"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import type { SocialPlatform } from "@/types/database";

interface SocialAccount {
  id: string;
  company_id: string;
  platform: SocialPlatform;
  account_name: string | null;
  account_id: string | null;
  has_tokens: boolean;
  is_active: boolean;
  spokesperson_id: string | null;
  created_at: string;
}

// SVG paths for platform logos
const PLATFORM_ICONS: Record<string, { path: string; color: string }> = {
  linkedin_company: {
    path: "M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14m-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.32 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93h2.79M6.88 8.56a1.68 1.68 0 0 0 1.68-1.68c0-.93-.75-1.69-1.68-1.69a1.69 1.69 0 0 0-1.69 1.69c0 .93.76 1.68 1.69 1.68m1.39 9.94v-8.37H5.5v8.37h2.77z",
    color: "#0A66C2",
  },
  facebook: {
    path: "M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z",
    color: "#1877F2",
  },
  instagram: {
    path: "M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z",
    color: "#E4405F",
  },
  twitter: {
    path: "M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z",
    color: "#000000",
  },
  bluesky: {
    path: "M12 10.8c-1.087-2.114-4.046-6.053-6.798-7.995C2.566.944 1.561 1.266.902 1.565.139 1.908 0 3.08 0 3.768c0 .69.378 5.65.624 6.479.785 2.627 3.59 3.501 6.128 3.462-3.529.105-6.507 1.272-3.44 4.665C6.356 21.597 9.652 22 12 17.248c2.348 4.752 5.644 4.349 8.688 1.126 3.067-3.393.089-4.56-3.44-4.665 2.539.039 5.343-.835 6.128-3.462C23.622 9.418 24 4.458 24 3.768c0-.688-.139-1.86-.902-2.203-.659-.3-1.664-.621-4.3 1.24C16.046 4.748 13.087 8.687 12 10.8z",
    color: "#0085FF",
  },
  threads: {
    path: "M12.186 24h-.007C5.965 23.97 2.2 19.98 2.2 14.07v-.2c.09-5.63 3.52-9.78 8.94-10.84a10.27 10.27 0 0 1 5.43.46 7.63 7.63 0 0 1 4.21 4.47l-1.85.85a5.84 5.84 0 0 0-3.22-3.42 8.29 8.29 0 0 0-4.37-.37c-4.44.87-7.19 4.27-7.28 8.98v.18c.06 4.73 2.87 7.95 7.32 8.37a8.67 8.67 0 0 0 5.25-1.14 5.64 5.64 0 0 0 2.62-4.55c-.04-1.68-.73-2.97-2.06-3.83a6.87 6.87 0 0 0-1.18-.62 13.48 13.48 0 0 1-.08 1.67c-.14 1.07-.5 1.98-1.06 2.69a3.55 3.55 0 0 1-2.75 1.31 3.45 3.45 0 0 1-2.63-.96 3.15 3.15 0 0 1-.81-2.42c.08-1.56.93-2.78 2.4-3.42a6.6 6.6 0 0 1 2.68-.54l.14.01c-.03-.48-.12-.94-.27-1.37a2.6 2.6 0 0 0-2.07-1.7 4.54 4.54 0 0 0-2.47.24l-.66-1.8a6.53 6.53 0 0 1 3.48-.36 4.5 4.5 0 0 1 3.52 2.93c.2.55.34 1.13.41 1.73a8.4 8.4 0 0 1 1.83.95c1.86 1.2 2.84 3.02 2.9 5.4a7.63 7.63 0 0 1-3.51 6.14A10.64 10.64 0 0 1 12.186 24zM11.4 15.42c-.52.08-.98.24-1.35.45-.83.47-1.27 1.13-1.31 1.95a1.24 1.24 0 0 0 .32.93c.29.3.72.46 1.18.44a1.6 1.6 0 0 0 1.27-.59c.37-.48.61-1.14.71-1.96.04-.3.06-.61.07-.93a4.7 4.7 0 0 0-.89-.29z",
    color: "#000000",
  },
};

// Company-level platforms — pages/accounts that represent the brand
const COMPANY_PLATFORMS: { value: SocialPlatform; label: string }[] = [
  { value: "linkedin_company", label: "LinkedIn (Company Page)" },
  { value: "facebook", label: "Facebook Page" },
  { value: "instagram", label: "Instagram (Brand)" },
  { value: "twitter", label: "Twitter / X (Brand)" },
  { value: "bluesky", label: "Bluesky (Brand)" },
  { value: "threads", label: "Threads (Brand)" },
];

export default function CompanySocialPage() {
  const { companyId } = useParams<{ companyId: string }>();
  const [accounts, setAccounts] = useState<SocialAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  // Form state
  const [showForm, setShowForm] = useState(false);
  const [formPlatform, setFormPlatform] = useState<SocialPlatform | "">("");
  const [formAccountName, setFormAccountName] = useState("");
  const [formAccountId, setFormAccountId] = useState("");

  useEffect(() => {
    fetchAccounts();
  }, [companyId]);

  async function fetchAccounts() {
    setLoading(true);
    // Fetch only company-level accounts (no spokesperson_id)
    const res = await fetch(
      `/api/config/social-accounts?companyId=${companyId}&spokespersonId=company`
    );
    const json = await res.json();
    setAccounts(json.data || []);
    setLoading(false);
  }

  async function handleSave() {
    if (!formPlatform) return;
    setSaving(true);
    setMessage(null);

    const res = await fetch("/api/config/social-accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        companyId,
        platform: formPlatform,
        accountName: formAccountName || null,
        accountId: formAccountId || null,
        // No spokespersonId = company-level account
      }),
    });

    const json = await res.json();
    setSaving(false);

    if (res.ok) {
      setMessage({ type: "success", text: "Account added" });
      setShowForm(false);
      setFormPlatform("");
      setFormAccountName("");
      setFormAccountId("");
      fetchAccounts();
    } else {
      setMessage({ type: "error", text: json.error || "Failed to save" });
    }
  }

  async function handleDelete(id: string) {
    const res = await fetch("/api/config/social-accounts", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });

    if (res.ok) {
      setMessage({ type: "success", text: "Account removed" });
      fetchAccounts();
    }
  }

  return (
    <div className="space-y-6">
      {message && (
        <div
          className={`rounded-lg px-4 py-3 text-sm ${
            message.type === "success"
              ? "bg-green-50 text-green-700"
              : "bg-red-50 text-red-700"
          }`}
        >
          {message.text}
        </div>
      )}

      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Company Social Accounts</h2>
          <p className="mt-1 text-sm text-gray-500">
            Company-level social pages and brand accounts.
            Personal accounts (individual LinkedIn, Twitter, etc.) are managed on each{" "}
            <Link href={`/setup/${companyId}/people`} className="text-sky-600 hover:underline">
              person&apos;s page
            </Link>
            .
          </p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="rounded-md bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-700"
        >
          + Add Account
        </button>
      </div>

      {showForm && (
        <div className="rounded-lg border border-gray-200 bg-white p-5 space-y-4">
          <h3 className="text-sm font-semibold text-gray-900">
            Add Company Account
          </h3>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="block text-xs font-medium text-gray-700">
                Platform
              </label>
              <select
                value={formPlatform}
                onChange={(e) =>
                  setFormPlatform(e.target.value as SocialPlatform)
                }
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm"
              >
                <option value="">Select...</option>
                {COMPANY_PLATFORMS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700">
                Account Name
              </label>
              <input
                type="text"
                value={formAccountName}
                onChange={(e) => setFormAccountName(e.target.value)}
                placeholder="e.g. AGENCY Bristol"
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700">
                Account ID / URL
              </label>
              <input
                type="text"
                value={formAccountId}
                onChange={(e) => setFormAccountId(e.target.value)}
                placeholder="Platform-specific ID"
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleSave}
              disabled={saving || !formPlatform}
              className="rounded-md bg-sky-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-700 disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save Account"}
            </button>
            <button
              onClick={() => setShowForm(false)}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Connected company accounts */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {COMPANY_PLATFORMS.map((platform) => {
          const connected = accounts.filter(
            (a) => a.platform === platform.value
          );
          return (
            <div
              key={platform.value}
              className={`rounded-lg border p-4 ${
                connected.length > 0
                  ? "border-green-200 bg-green-50/30"
                  : "border-gray-200 bg-white"
              }`}
            >
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-md" style={{ backgroundColor: (PLATFORM_ICONS[platform.value]?.color || "#6B7280") + "15" }}>
                  <svg className="h-4.5 w-4.5" viewBox="0 0 24 24" fill={PLATFORM_ICONS[platform.value]?.color || "#6B7280"}>
                    <path d={PLATFORM_ICONS[platform.value]?.path || ""} />
                  </svg>
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-900">
                    {platform.label}
                  </p>
                  {connected.length > 0 ? (
                    connected.map((acc) => (
                      <div
                        key={acc.id}
                        className="mt-1 flex items-center justify-between"
                      >
                        <span className="text-xs text-gray-600">
                          {acc.account_name || acc.account_id || "Connected"}
                        </span>
                        <button
                          onClick={() => handleDelete(acc.id)}
                          className="text-xs text-red-500 hover:text-red-700"
                        >
                          Remove
                        </button>
                      </div>
                    ))
                  ) : (
                    <p className="mt-1 text-xs text-gray-400">Not connected</p>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {loading && (
        <p className="text-center text-sm text-gray-400">Loading...</p>
      )}
    </div>
  );
}
