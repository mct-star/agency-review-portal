"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";

interface CtaUrl {
  id?: string;
  label: string;
  url: string;
  link_text: string;
}

export default function UrlsPage() {
  const { companyId } = useParams<{ companyId: string }>();
  const [urls, setUrls] = useState<CtaUrl[]>([]);
  const [newUrl, setNewUrl] = useState<CtaUrl>({ label: "", url: "", link_text: "" });
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
      setNewUrl({ label: "", url: "", link_text: "" });
      setMessage("Added");
    } catch {
      setMessage("Error saving");
    } finally {
      setSaving(false);
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
        <h2 className="text-lg font-semibold text-gray-900">Key URLs</h2>
        <p className="mt-1 text-sm text-gray-500">
          Destination URLs for CTAs in posts and first comments. These are injected into your content automatically.
        </p>
      </div>

      {/* URL list */}
      <div className="space-y-2">
        {urls.map((u) => (
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
            <button
              onClick={() => handleDelete(u.id!)}
              className="text-xs text-red-500 hover:text-red-700"
            >
              Remove
            </button>
          </div>
        ))}
      </div>

      {urls.length === 0 && (
        <div className="rounded-lg border border-dashed border-gray-300 p-8 text-center">
          <p className="text-gray-500">No URLs configured yet.</p>
        </div>
      )}

      {/* Add new URL */}
      <div className="rounded-lg border border-gray-200 bg-white p-4 space-y-3">
        <h3 className="text-sm font-semibold text-gray-900">Add URL</h3>
        <div className="grid gap-3 sm:grid-cols-3">
          <input
            type="text"
            value={newUrl.label}
            onChange={(e) => setNewUrl({ ...newUrl, label: e.target.value })}
            placeholder="Label (e.g. Newsletter)"
            className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none"
          />
          <input
            type="url"
            value={newUrl.url}
            onChange={(e) => setNewUrl({ ...newUrl, url: e.target.value })}
            placeholder="https://..."
            className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none"
          />
          <input
            type="text"
            value={newUrl.link_text}
            onChange={(e) => setNewUrl({ ...newUrl, link_text: e.target.value })}
            placeholder="Link text (e.g. Sign up)"
            className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none"
          />
        </div>
        <button
          onClick={handleAdd}
          disabled={saving || !newUrl.label || !newUrl.url}
          className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
        >
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
