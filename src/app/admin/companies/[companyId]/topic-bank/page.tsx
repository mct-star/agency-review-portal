"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

interface Topic {
  id: string;
  company_id: string;
  topic_number: number;
  title: string;
  pillar: string | null;
  audience_theme: string | null;
  description: string | null;
  source_reference: string | null;
  is_used: boolean;
  used_in_week_id: string | null;
  created_at: string;
}

export default function TopicBankPage() {
  const { companyId } = useParams<{ companyId: string }>();
  const [topics, setTopics] = useState<Topic[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  // Filter state
  const [filterPillar, setFilterPillar] = useState("");
  const [filterUsed, setFilterUsed] = useState<"all" | "used" | "unused">(
    "all"
  );

  // Form state
  const [showForm, setShowForm] = useState(false);
  const [formNumber, setFormNumber] = useState("");
  const [formTitle, setFormTitle] = useState("");
  const [formPillar, setFormPillar] = useState("");
  const [formTheme, setFormTheme] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchTopics();
  }, [companyId]);

  async function fetchTopics() {
    setLoading(true);
    const res = await fetch(`/api/config/topic-bank?companyId=${companyId}`);
    const json = await res.json();
    setTopics(json.data || []);
    setLoading(false);
  }

  async function handleSave() {
    if (!formTitle || !formNumber) return;
    setSaving(true);
    setMessage(null);

    const res = await fetch("/api/config/topic-bank", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        companyId,
        topics: [
          {
            topicNumber: parseInt(formNumber),
            title: formTitle,
            pillar: formPillar || null,
            audienceTheme: formTheme || null,
            description: formDescription || null,
          },
        ],
      }),
    });

    const json = await res.json();
    setSaving(false);

    if (res.ok) {
      setMessage({ type: "success", text: "Topic saved" });
      setShowForm(false);
      setFormNumber("");
      setFormTitle("");
      setFormPillar("");
      setFormTheme("");
      setFormDescription("");
      fetchTopics();
    } else {
      setMessage({ type: "error", text: json.error || "Failed to save" });
    }
  }

  async function handleDelete(id: string) {
    const res = await fetch("/api/config/topic-bank", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });

    if (res.ok) {
      setMessage({ type: "success", text: "Topic removed" });
      fetchTopics();
    }
  }

  // Get unique pillars for filter
  const pillars = [...new Set(topics.map((t) => t.pillar).filter(Boolean))];

  // Apply filters
  const filtered = topics.filter((t) => {
    if (filterPillar && t.pillar !== filterPillar) return false;
    if (filterUsed === "used" && !t.is_used) return false;
    if (filterUsed === "unused" && t.is_used) return false;
    return true;
  });

  const usedCount = topics.filter((t) => t.is_used).length;

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

      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-500">
            {topics.length} topics · {usedCount} used · {topics.length - usedCount}{" "}
            available
          </p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="rounded-md bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-700"
        >
          + Add Topic
        </button>
      </div>

      {showForm && (
        <div className="rounded-lg border border-gray-200 bg-white p-5 space-y-4">
          <h3 className="text-sm font-semibold text-gray-900">Add Topic</h3>
          <div className="grid gap-4 sm:grid-cols-4">
            <div>
              <label className="block text-xs font-medium text-gray-700">
                Number
              </label>
              <input
                type="number"
                value={formNumber}
                onChange={(e) => setFormNumber(e.target.value)}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm"
                placeholder="#"
              />
            </div>
            <div className="sm:col-span-3">
              <label className="block text-xs font-medium text-gray-700">
                Title
              </label>
              <input
                type="text"
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm"
                placeholder="Topic title"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700">
                Pillar
              </label>
              <input
                type="text"
                value={formPillar}
                onChange={(e) => setFormPillar(e.target.value)}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm"
                placeholder="P1, P2..."
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700">
                Audience Theme
              </label>
              <input
                type="text"
                value={formTheme}
                onChange={(e) => setFormTheme(e.target.value)}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm"
                placeholder="A, V, S..."
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-gray-700">
                Description
              </label>
              <input
                type="text"
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm"
                placeholder="Brief description"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleSave}
              disabled={saving || !formTitle || !formNumber}
              className="rounded-md bg-sky-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-700 disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save Topic"}
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

      {/* Filters */}
      <div className="flex gap-3">
        <select
          value={filterPillar}
          onChange={(e) => setFilterPillar(e.target.value)}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm"
        >
          <option value="">All pillars</option>
          {pillars.map((p) => (
            <option key={p!} value={p!}>
              {p}
            </option>
          ))}
        </select>
        <select
          value={filterUsed}
          onChange={(e) =>
            setFilterUsed(e.target.value as "all" | "used" | "unused")
          }
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm"
        >
          <option value="all">All topics</option>
          <option value="unused">Unused only</option>
          <option value="used">Used only</option>
        </select>
      </div>

      {/* Topic table */}
      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-2.5 text-left text-xs font-medium uppercase text-gray-500">
                #
              </th>
              <th className="px-3 py-2.5 text-left text-xs font-medium uppercase text-gray-500">
                Title
              </th>
              <th className="px-3 py-2.5 text-left text-xs font-medium uppercase text-gray-500">
                Pillar
              </th>
              <th className="px-3 py-2.5 text-left text-xs font-medium uppercase text-gray-500">
                Theme
              </th>
              <th className="px-3 py-2.5 text-left text-xs font-medium uppercase text-gray-500">
                Status
              </th>
              <th className="px-3 py-2.5 text-right text-xs font-medium uppercase text-gray-500">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {filtered.map((topic) => (
              <tr key={topic.id} className={topic.is_used ? "bg-gray-50" : ""}>
                <td className="px-3 py-2.5 text-sm font-mono text-gray-500">
                  {topic.topic_number}
                </td>
                <td className="px-3 py-2.5">
                  <p className="text-sm font-medium text-gray-900">
                    {topic.title}
                  </p>
                  {topic.description && (
                    <p className="text-xs text-gray-500 truncate max-w-md">
                      {topic.description}
                    </p>
                  )}
                </td>
                <td className="px-3 py-2.5">
                  {topic.pillar && (
                    <span className="inline-flex items-center rounded-full bg-sky-100 px-2 py-0.5 text-xs font-medium text-sky-700">
                      {topic.pillar}
                    </span>
                  )}
                </td>
                <td className="px-3 py-2.5">
                  {topic.audience_theme && (
                    <span className="inline-flex items-center rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-700">
                      {topic.audience_theme}
                    </span>
                  )}
                </td>
                <td className="px-3 py-2.5">
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                      topic.is_used
                        ? "bg-gray-100 text-gray-500"
                        : "bg-green-100 text-green-700"
                    }`}
                  >
                    {topic.is_used ? "Used" : "Available"}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-right">
                  <button
                    onClick={() => handleDelete(topic.id)}
                    className="text-xs text-red-500 hover:text-red-700"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && !loading && (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-8 text-center text-sm text-gray-400"
                >
                  No topics found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {loading && (
        <p className="text-center text-sm text-gray-400">Loading...</p>
      )}
    </div>
  );
}
