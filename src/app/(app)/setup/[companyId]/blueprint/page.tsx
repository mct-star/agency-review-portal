"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

interface Blueprint {
  id: string;
  company_id: string;
  version: string;
  blueprint_content: string;
  derived_source_context: string | null;
  derived_brand_context: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export default function BlueprintPage() {
  const { companyId } = useParams<{ companyId: string }>();
  const [blueprints, setBlueprints] = useState<Blueprint[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  // Editor state
  const [content, setContent] = useState("");
  const [version, setVersion] = useState("");
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    fetchBlueprints();
  }, [companyId]);

  async function fetchBlueprints() {
    setLoading(true);
    const res = await fetch(`/api/config/blueprint?companyId=${companyId}`);
    const json = await res.json();
    const data = json.data || [];
    setBlueprints(data);

    // Load the active blueprint into the editor
    const active = data.find((b: Blueprint) => b.is_active);
    if (active) {
      setContent(active.blueprint_content);
      setVersion(active.version);
    }
    setLoading(false);
  }

  async function handleSave() {
    if (!content.trim()) return;
    setSaving(true);
    setMessage(null);

    const activeBlueprint = blueprints.find((b) => b.is_active);

    // If editing existing, update it. If new version, create new.
    if (activeBlueprint && version === activeBlueprint.version) {
      const res = await fetch("/api/config/blueprint", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: activeBlueprint.id,
          blueprintContent: content,
        }),
      });
      const json = await res.json();
      setSaving(false);
      if (res.ok) {
        setMessage({ type: "success", text: "Blueprint updated" });
        setIsEditing(false);
        fetchBlueprints();
      } else {
        setMessage({ type: "error", text: json.error || "Failed to save" });
      }
    } else {
      // Create new version
      const res = await fetch("/api/config/blueprint", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId,
          blueprintContent: content,
          version: version || "1.0",
        }),
      });
      const json = await res.json();
      setSaving(false);
      if (res.ok) {
        setMessage({ type: "success", text: "New blueprint version created" });
        setIsEditing(false);
        fetchBlueprints();
      } else {
        setMessage({ type: "error", text: json.error || "Failed to save" });
      }
    }
  }

  const activeBlueprint = blueprints.find((b) => b.is_active);

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
            The Company Blueprint drives all content generation. Paste the
            full markdown document here.
          </p>
          {activeBlueprint && (
            <p className="mt-1 text-xs text-gray-400">
              Version {activeBlueprint.version} · Last updated{" "}
              {new Date(activeBlueprint.updated_at).toLocaleDateString()}
            </p>
          )}
        </div>
        <button
          onClick={() => {
            if (!isEditing && !activeBlueprint) {
              setVersion("1.0");
            }
            setIsEditing(!isEditing);
          }}
          className="rounded-md bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-700"
        >
          {isEditing ? "Cancel" : activeBlueprint ? "Edit Blueprint" : "+ Create Blueprint"}
        </button>
      </div>

      {isEditing && (
        <div className="space-y-3">
          <div className="flex gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-700">
                Version
              </label>
              <input
                type="text"
                value={version}
                onChange={(e) => setVersion(e.target.value)}
                className="mt-1 w-24 rounded-md border border-gray-300 px-3 py-1.5 text-sm"
                placeholder="1.0"
              />
            </div>
          </div>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={25}
            className="block w-full rounded-lg border border-gray-300 p-4 font-mono text-sm text-gray-900 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
            placeholder="Paste the Company Blueprint markdown here..."
          />
          <button
            onClick={handleSave}
            disabled={saving || !content.trim()}
            className="rounded-md bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save Blueprint"}
          </button>
        </div>
      )}

      {!isEditing && activeBlueprint && (
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <pre className="whitespace-pre-wrap font-mono text-xs text-gray-700 leading-relaxed max-h-[600px] overflow-y-auto">
            {activeBlueprint.blueprint_content}
          </pre>
        </div>
      )}

      {!isEditing && !activeBlueprint && !loading && (
        <div className="rounded-lg border border-dashed border-gray-300 p-12 text-center">
          <p className="text-sm text-gray-500">
            No blueprint configured for this company yet.
          </p>
          <p className="mt-1 text-xs text-gray-400">
            The blueprint is the master document that drives all content
            generation.
          </p>
        </div>
      )}

      {/* Version history */}
      {blueprints.length > 1 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-gray-900">
            Version History
          </h3>
          <div className="divide-y divide-gray-200 rounded-lg border border-gray-200 bg-white">
            {blueprints.map((bp) => (
              <div
                key={bp.id}
                className="flex items-center justify-between px-4 py-3"
              >
                <div>
                  <span className="text-sm font-medium text-gray-900">
                    v{bp.version}
                  </span>
                  {bp.is_active && (
                    <span className="ml-2 inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                      Active
                    </span>
                  )}
                </div>
                <span className="text-xs text-gray-500">
                  {new Date(bp.created_at).toLocaleDateString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {loading && (
        <p className="text-center text-sm text-gray-400">Loading...</p>
      )}
    </div>
  );
}
