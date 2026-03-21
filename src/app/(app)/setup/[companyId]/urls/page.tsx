"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";

type CtaTier = "primary" | "secondary" | "tertiary";

interface CtaUrl {
  id?: string;
  label: string;
  url: string;
  link_text: string;
  cta_tier: CtaTier;
}

const TIER_CONFIG: Record<CtaTier, { label: string; description: string; color: string; bgColor: string }> = {
  primary: { label: "Primary", description: "Conversion actions (book a call, schedule demo)", color: "text-red-700", bgColor: "bg-red-50 border-red-200" },
  secondary: { label: "Secondary", description: "Content consumption (read blog, download guide)", color: "text-amber-700", bgColor: "bg-amber-50 border-amber-200" },
  tertiary: { label: "Tertiary", description: "Soft engagement (subscribe, follow, podcast)", color: "text-green-700", bgColor: "bg-green-50 border-green-200" },
};

export default function UrlsPage() {
  const { companyId } = useParams<{ companyId: string }>();
  const [urls, setUrls] = useState<CtaUrl[]>([]);
  const [newUrl, setNewUrl] = useState<CtaUrl>({ label: "", url: "", link_text: "", cta_tier: "secondary" });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    fetch(`/api/config/urls?companyId=${companyId}`)
      .then((r) => r.json())
      .then((d) => setUrls(d.data || []));
  }, [companyId]);

  const handleAdd = async () => {
    if (!newUrl.label || !newUrl.url) return;
    setSaving(true);
    try {
      const res = await fetch("/api/config/urls", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId, ...newUrl }),
      });
      if (!res.ok) throw new Error("Save failed");
      const data = await res.json();
      setUrls([...urls, data.data]);
      setNewUrl({ label: "", url: "", link_text: "", cta_tier: "secondary" });
      setMessage("Added");
    } catch {
      setMessage("Error saving");
    } finally {
      setSaving(false);
    }
  };

  const handleChangeTier = async (id: string, newTier: CtaTier) => {
    try {
      const res = await fetch("/api/config/urls", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, cta_tier: newTier }),
      });
      if (!res.ok) throw new Error("Update failed");
      setUrls(urls.map((u) => (u.id === id ? { ...u, cta_tier: newTier } : u)));
    } catch {
      setMessage("Error updating tier");
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await fetch("/api/config/urls", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      setUrls(urls.filter((u) => u.id !== id));
    } catch {
      setMessage("Error deleting");
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">CTA URLs</h2>
        <p className="mt-1 text-sm text-gray-500">
          Destination URLs ranked by priority. The week ecosystem assigns CTAs intelligently — primary CTAs appear
          late in the week (conversion), secondary mid-week (content), tertiary for soft engagement.
        </p>
      </div>

      {/* URLs grouped by tier */}
      {(["primary", "secondary", "tertiary"] as CtaTier[]).map((tier) => {
        const tierUrls = urls.filter((u) => (u.cta_tier || "secondary") === tier);
        const config = TIER_CONFIG[tier];
        return (
          <div key={tier}>
            <div className="flex items-center gap-2 mb-2">
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${config.color} ${config.bgColor} border`}>
                {config.label}
              </span>
              <span className="text-xs text-gray-400">{config.description}</span>
            </div>
            {tierUrls.length === 0 ? (
              <div className="rounded-lg border border-dashed border-gray-200 p-3 mb-3">
                <p className="text-xs text-gray-400 text-center">No {tier} CTAs configured</p>
              </div>
            ) : (
              <div className="space-y-1.5 mb-3">
                {tierUrls.map((u) => (
                  <div key={u.id} className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white p-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-900">{u.label}</span>
                        {u.link_text && (
                          <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-500">
                            {u.link_text}
                          </span>
                        )}
                      </div>
                      <p className="truncate text-xs text-gray-500">{u.url}</p>
                    </div>
                    <select
                      value={u.cta_tier || "secondary"}
                      onChange={(e) => handleChangeTier(u.id!, e.target.value as CtaTier)}
                      className="rounded border border-gray-200 px-2 py-1 text-xs text-gray-600"
                    >
                      <option value="primary">Primary</option>
                      <option value="secondary">Secondary</option>
                      <option value="tertiary">Tertiary</option>
                    </select>
                    <button
                      onClick={() => handleDelete(u.id!)}
                      className="text-xs text-red-500 hover:text-red-700"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}

      {/* Add new URL */}
      <div className="rounded-lg border border-gray-200 bg-white p-4 space-y-3">
        <h3 className="text-sm font-semibold text-gray-900">Add URL</h3>
        <div className="grid gap-3 sm:grid-cols-3">
          <input type="text" value={newUrl.label} onChange={(e) => setNewUrl({ ...newUrl, label: e.target.value })} placeholder="Label (e.g. Newsletter)" className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none" />
          <input type="url" value={newUrl.url} onChange={(e) => setNewUrl({ ...newUrl, url: e.target.value })} placeholder="https://..." className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none" />
          <input type="text" value={newUrl.link_text} onChange={(e) => setNewUrl({ ...newUrl, link_text: e.target.value })} placeholder="Link text (e.g. Sign up)" className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none" />
        </div>
        <div className="flex gap-2">
          {(["primary", "secondary", "tertiary"] as CtaTier[]).map((tier) => (
            <button
              key={tier}
              type="button"
              onClick={() => setNewUrl({ ...newUrl, cta_tier: tier })}
              className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
                newUrl.cta_tier === tier
                  ? `${TIER_CONFIG[tier].bgColor} ${TIER_CONFIG[tier].color} border-current`
                  : "border-gray-200 text-gray-500 hover:border-gray-300"
              }`}
            >
              {TIER_CONFIG[tier].label}
            </button>
          ))}
        </div>
        <button onClick={handleAdd} disabled={saving || !newUrl.label || !newUrl.url} className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50">
          {saving ? "Adding..." : "Add URL"}
        </button>
      </div>

      {message && (
        <p className={`text-sm ${message.includes("Error") ? "text-red-600" : "text-green-600"}`}>
          {message}
        </p>
      )}
    </div>
  );
}
