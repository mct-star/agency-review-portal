"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";

interface Signoff {
  id?: string;
  label: string;
  signoff_text: string;
  first_comment_template: string;
}

export default function SignoffsPage() {
  const { companyId } = useParams<{ companyId: string }>();
  const [signoffs, setSignoffs] = useState<Signoff[]>([]);
  const [editing, setEditing] = useState<Signoff | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    fetch(`/api/config/signoffs?companyId=${companyId}`)
      .then((r) => r.json())
      .then((d) => setSignoffs(d.data || []));
  }, [companyId]);

  const handleSave = async () => {
    if (!editing) return;
    setSaving(true);
    setMessage("");
    try {
      const res = await fetch("/api/config/signoffs", {
        method: editing.id ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId, ...editing }),
      });
      if (!res.ok) throw new Error("Save failed");
      const data = await res.json();
      if (editing.id) {
        setSignoffs(signoffs.map((s) => (s.id === editing.id ? data.data : s)));
      } else {
        setSignoffs([...signoffs, data.data]);
      }
      setEditing(null);
      setMessage("Saved");
    } catch {
      setMessage("Error saving");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Sign-offs and CTAs</h2>
          <p className="mt-1 text-sm text-gray-500">
            Configure the standard ending text and first comment CTA that gets added to every post.
            Use <code className="rounded bg-gray-100 px-1 text-xs">{"{url}"}</code> in the first comment template to insert the CTA URL.
          </p>
        </div>
        <button
          onClick={() =>
            setEditing({
              label: "Default",
              signoff_text: "",
              first_comment_template: "",
            })
          }
          className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
        >
          Add Sign-off
        </button>
      </div>

      {/* Existing sign-offs */}
      {signoffs.map((s) => (
        <div key={s.id} className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="flex items-start justify-between">
            <h3 className="text-sm font-semibold text-gray-900">{s.label}</h3>
            <button
              onClick={() => setEditing(s)}
              className="text-xs text-sky-600 hover:text-sky-700"
            >
              Edit
            </button>
          </div>
          <div className="mt-2 rounded-md bg-gray-50 p-3">
            <p className="text-xs font-medium uppercase text-gray-400">Sign-off Text</p>
            <p className="mt-1 text-sm text-gray-700 whitespace-pre-wrap">{s.signoff_text}</p>
          </div>
          {s.first_comment_template && (
            <div className="mt-2 rounded-md bg-gray-50 p-3">
              <p className="text-xs font-medium uppercase text-gray-400">First Comment Template</p>
              <p className="mt-1 text-sm text-gray-700 whitespace-pre-wrap">{s.first_comment_template}</p>
            </div>
          )}
        </div>
      ))}

      {signoffs.length === 0 && !editing && (
        <div className="rounded-lg border border-dashed border-gray-300 p-12 text-center">
          <p className="text-gray-500">No sign-offs configured yet.</p>
        </div>
      )}

      {/* Editor */}
      {editing && (
        <div className="rounded-lg border border-sky-200 bg-sky-50 p-4 space-y-4">
          <h3 className="text-sm font-semibold text-gray-900">
            {editing.id ? "Edit Sign-off" : "New Sign-off"}
          </h3>
          <div>
            <label className="block text-sm font-medium text-gray-700">Label</label>
            <input
              type="text"
              value={editing.label}
              onChange={(e) => setEditing({ ...editing, label: e.target.value })}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Sign-off Text</label>
            <textarea
              value={editing.signoff_text}
              onChange={(e) => setEditing({ ...editing, signoff_text: e.target.value })}
              rows={3}
              placeholder='Enjoy this? ♻️ Repost it to your network and follow [Name] for more.'
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">First Comment Template</label>
            <textarea
              value={editing.first_comment_template}
              onChange={(e) => setEditing({ ...editing, first_comment_template: e.target.value })}
              rows={3}
              placeholder='Want to go deeper? Download our free guide: {url}'
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="rounded-md bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save"}
            </button>
            <button
              onClick={() => setEditing(null)}
              className="rounded-md border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {message && (
        <p className={`text-sm ${message.includes("Error") ? "text-red-600" : "text-green-600"}`}>
          {message}
        </p>
      )}
    </div>
  );
}
