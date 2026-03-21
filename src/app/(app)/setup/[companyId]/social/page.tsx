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

// Company-level platforms — pages/accounts that represent the brand
const COMPANY_PLATFORMS: { value: SocialPlatform; label: string; icon: string }[] = [
  { value: "linkedin_company", label: "LinkedIn (Company Page)", icon: "in" },
  { value: "facebook", label: "Facebook Page", icon: "Fb" },
  { value: "instagram", label: "Instagram (Brand)", icon: "Ig" },
  { value: "twitter", label: "Twitter / X (Brand)", icon: "X" },
  { value: "bluesky", label: "Bluesky (Brand)", icon: "BS" },
  { value: "threads", label: "Threads (Brand)", icon: "Th" },
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
                <div className="flex h-8 w-8 items-center justify-center rounded-md bg-gray-100 text-xs font-bold text-gray-600">
                  {platform.icon}
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
