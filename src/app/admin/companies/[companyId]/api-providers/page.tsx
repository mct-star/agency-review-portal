"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import type { ServiceCategory } from "@/types/database";

interface ApiConfig {
  id: string;
  company_id: string;
  service_category: ServiceCategory;
  provider: string;
  has_credentials: boolean;
  provider_settings: Record<string, unknown>;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

const SERVICE_CATEGORIES: {
  value: ServiceCategory;
  label: string;
  description: string;
  providers: string[];
}[] = [
  {
    value: "image_generation",
    label: "Image Generation",
    description: "AI-powered image creation for social posts, blog headers, and PDFs",
    providers: ["fal_flux", "openai_gpt_image", "ideogram", "runway", "manus"],
  },
  {
    value: "content_generation",
    label: "Content Generation",
    description: "AI text generation for blogs, social posts, and scripts",
    providers: ["anthropic_claude", "openai_gpt4"],
  },
  {
    value: "blog_publishing",
    label: "Blog Publishing",
    description: "Publish blog articles to CMS platforms",
    providers: ["wordpress", "wix"],
  },
  {
    value: "social_scheduling",
    label: "Social Scheduling",
    description: "Schedule and publish social media posts",
    providers: ["metricool", "buffer", "linkedin_direct"],
  },
  {
    value: "video_rendering",
    label: "Video Rendering",
    description: "Automated video creation from scripts and storyboards",
    providers: ["shotstack", "creatomate"],
  },
  {
    value: "transcription",
    label: "Transcription",
    description: "Audio/video to text conversion",
    providers: ["openai_whisper", "deepgram", "assemblyai"],
  },
  {
    value: "newsletter_publishing",
    label: "Newsletter Publishing",
    description: "Publish articles as newsletters (e.g. Substack)",
    providers: ["substack"],
  },
  {
    value: "content_syndication",
    label: "Content Syndication",
    description: "Cross-post articles to content platforms (e.g. Medium)",
    providers: ["medium"],
  },
  {
    value: "video_hosting",
    label: "Video Hosting",
    description: "Upload and host videos on platforms (YouTube, TikTok, Instagram)",
    providers: ["youtube", "tiktok", "instagram_graph"],
  },
];

const PROVIDER_LABELS: Record<string, string> = {
  fal_flux: "fal.ai — Flux 1.1 Pro (recommended)",
  openai_gpt_image: "OpenAI (DALL-E 3)",
  ideogram: "Ideogram (best for text-in-image)",
  runway: "Runway Gen-3",
  manus: "Manus Agent (async, 1–4 min/image)",
  anthropic_claude: "Anthropic Claude",
  openai_gpt4: "OpenAI GPT-4",
  wordpress: "WordPress",
  wix: "Wix",
  metricool: "Metricool",
  buffer: "Buffer",
  linkedin_direct: "LinkedIn Direct API",
  shotstack: "Shotstack",
  creatomate: "Creatomate",
  openai_whisper: "OpenAI Whisper",
  deepgram: "Deepgram",
  assemblyai: "AssemblyAI",
  substack: "Substack",
  medium: "Medium",
  youtube: "YouTube",
  tiktok: "TikTok",
  instagram_graph: "Instagram Graph API",
};

export default function ApiProvidersPage() {
  const { companyId } = useParams<{ companyId: string }>();
  const [configs, setConfigs] = useState<ApiConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Form state
  const [editCategory, setEditCategory] = useState<ServiceCategory | null>(null);
  const [editProvider, setEditProvider] = useState("");
  const [editApiKey, setEditApiKey] = useState("");

  useEffect(() => {
    fetchConfigs();
  }, [companyId]);

  async function fetchConfigs() {
    setLoading(true);
    const res = await fetch(`/api/config/api-providers?companyId=${companyId}`);
    const json = await res.json();
    setConfigs(json.data || []);
    setLoading(false);
  }

  async function handleSave() {
    if (!editCategory || !editProvider) return;
    setSaving(true);
    setMessage(null);

    const res = await fetch("/api/config/api-providers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        companyId,
        serviceCategory: editCategory,
        provider: editProvider,
        credentials: editApiKey ? { api_key: editApiKey } : undefined,
      }),
    });

    const json = await res.json();
    setSaving(false);

    if (res.ok) {
      setMessage({ type: "success", text: "Provider saved successfully" });
      setEditCategory(null);
      setEditProvider("");
      setEditApiKey("");
      fetchConfigs();
    } else {
      setMessage({ type: "error", text: json.error || "Failed to save" });
    }
  }

  async function handleDelete(id: string) {
    const res = await fetch("/api/config/api-providers", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });

    if (res.ok) {
      setMessage({ type: "success", text: "Provider removed" });
      fetchConfigs();
    }
  }

  function getConfigForCategory(category: ServiceCategory): ApiConfig | undefined {
    return configs.find((c) => c.service_category === category && c.is_active);
  }

  return (
    <div className="space-y-6">
      {/* Status message */}
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

      {/* Category cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {SERVICE_CATEGORIES.map((category) => {
          const existing = getConfigForCategory(category.value);
          const isEditing = editCategory === category.value;

          return (
            <div
              key={category.value}
              className={`rounded-lg border bg-white p-5 transition-colors ${
                existing
                  ? "border-green-200 bg-green-50/30"
                  : "border-gray-200"
              }`}
            >
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-gray-900">
                    {category.label}
                  </h3>
                  <p className="mt-1 text-xs text-gray-500">
                    {category.description}
                  </p>
                </div>
                {existing && (
                  <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                    Active
                  </span>
                )}
              </div>

              {existing && !isEditing && (
                <div className="mt-3 space-y-2">
                  <div className="flex items-center justify-between rounded-md bg-gray-50 px-3 py-2">
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        {PROVIDER_LABELS[existing.provider] || existing.provider}
                      </p>
                      <p className="text-xs text-gray-500">
                        {existing.has_credentials ? "Credentials set" : "No credentials"}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          setEditCategory(category.value);
                          setEditProvider(existing.provider);
                          setEditApiKey("");
                        }}
                        className="text-xs text-sky-600 hover:text-sky-800"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(existing.id)}
                        className="text-xs text-red-500 hover:text-red-700"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {isEditing && (
                <div className="mt-3 space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-700">
                      Provider
                    </label>
                    <select
                      value={editProvider}
                      onChange={(e) => setEditProvider(e.target.value)}
                      className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                    >
                      <option value="">Select provider...</option>
                      {category.providers.map((p) => (
                        <option key={p} value={p}>
                          {PROVIDER_LABELS[p] || p}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700">
                      API Key
                    </label>
                    <input
                      type="password"
                      value={editApiKey}
                      onChange={(e) => setEditApiKey(e.target.value)}
                      placeholder="Enter API key..."
                      className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                    />
                    <p className="mt-1 text-xs text-gray-400">
                      Leave blank to keep existing credentials
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={handleSave}
                      disabled={saving || !editProvider}
                      className="rounded-md bg-sky-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-700 disabled:opacity-50"
                    >
                      {saving ? "Saving..." : "Save"}
                    </button>
                    <button
                      onClick={() => {
                        setEditCategory(null);
                        setEditProvider("");
                        setEditApiKey("");
                      }}
                      className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {!existing && !isEditing && (
                <button
                  onClick={() => setEditCategory(category.value)}
                  className="mt-3 w-full rounded-md border border-dashed border-gray-300 px-3 py-2 text-xs font-medium text-gray-500 hover:border-gray-400 hover:text-gray-700"
                >
                  + Configure provider
                </button>
              )}
            </div>
          );
        })}
      </div>

      {loading && (
        <p className="text-center text-sm text-gray-400">Loading...</p>
      )}

      {/* ===== Provider Routing Matrix ===== */}
      <div className="mt-8">
        <h2 className="text-lg font-bold text-gray-900">Image Provider Routing</h2>
        <p className="mt-1 text-xs text-gray-500">
          Override which AI provider handles each visual style for this company.
          &quot;Auto&quot; uses the smart routing (Gemini for photography, fal.ai for 3D).
        </p>
        <ProviderRoutingMatrix companyId={companyId} />
      </div>
    </div>
  );
}

// ── Provider Routing Matrix Component ──────────────────────

const VISUAL_STYLES = [
  { slug: "quote_card", label: "Quote Card", defaultProvider: "programmatic", cost: "£0" },
  { slug: "scene_quote", label: "Scene Quote", defaultProvider: "gemini_imagen", cost: "~£0" },
  { slug: "editorial_photo", label: "Editorial Photo", defaultProvider: "gemini_imagen", cost: "~£0" },
  { slug: "carousel_framework", label: "Carousel", defaultProvider: "programmatic", cost: "£0" },
  { slug: "pixar_3d", label: "Cinematic 3D", defaultProvider: "fal_flux", cost: "~£0.04" },
  { slug: "pixar_fantasy", label: "Cinematic Fantasy", defaultProvider: "fal_flux", cost: "~£0.04" },
  { slug: "pixar_healthcare", label: "Cinematic Healthcare", defaultProvider: "fal_flux", cost: "~£0.04" },
];

const PROVIDER_OPTIONS = [
  { value: "auto", label: "Auto (smart routing)" },
  { value: "programmatic", label: "Programmatic (Satori)" },
  { value: "gemini_imagen", label: "Gemini Imagen (free)" },
  { value: "fal_flux", label: "fal.ai Flux Pro" },
  { value: "openai_gpt_image", label: "OpenAI DALL-E" },
];

function ProviderRoutingMatrix({ companyId }: { companyId: string }) {
  const [routing, setRouting] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/config/company/details?companyId=${companyId}`);
        if (res.ok) {
          const data = await res.json();
          setRouting(data.provider_routing || {});
        }
      } catch {
        // Non-critical
      }
    }
    load();
  }, [companyId]);

  async function handleSave() {
    setSaving(true);
    setMessage("");
    try {
      const res = await fetch("/api/config/company/details", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId,
          provider_routing: routing,
        }),
      });
      if (!res.ok) throw new Error("Save failed");
      setMessage("Provider routing saved");
    } catch {
      setMessage("Error saving routing");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-4">
      <div className="overflow-hidden rounded-lg border border-gray-200">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="px-4 py-2.5 text-left font-semibold text-gray-600">Visual Style</th>
              <th className="px-4 py-2.5 text-left font-semibold text-gray-600">Default Provider</th>
              <th className="px-4 py-2.5 text-left font-semibold text-gray-600">Cost</th>
              <th className="px-4 py-2.5 text-left font-semibold text-gray-600">Override</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {VISUAL_STYLES.map((style) => (
              <tr key={style.slug} className="hover:bg-gray-50">
                <td className="px-4 py-2.5 font-medium text-gray-900">{style.label}</td>
                <td className="px-4 py-2.5 text-gray-500">
                  {style.defaultProvider === "programmatic" ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2 py-0.5 text-[10px] font-medium text-green-700 ring-1 ring-inset ring-green-200">
                      Programmatic
                    </span>
                  ) : style.defaultProvider === "gemini_imagen" ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-700 ring-1 ring-inset ring-blue-200">
                      Gemini (free)
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700 ring-1 ring-inset ring-amber-200">
                      fal.ai
                    </span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-gray-400">{style.cost}</td>
                <td className="px-4 py-2.5">
                  <select
                    value={routing[style.slug] || "auto"}
                    onChange={(e) => setRouting({ ...routing, [style.slug]: e.target.value })}
                    className="rounded border border-gray-200 px-2 py-1 text-xs focus:border-sky-400 focus:outline-none"
                  >
                    {PROVIDER_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="rounded-md bg-gray-900 px-4 py-2 text-xs font-medium text-white hover:bg-gray-800 disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save Routing"}
        </button>
        {message && (
          <span className={`text-xs ${message.includes("Error") ? "text-red-600" : "text-green-600"}`}>
            {message}
          </span>
        )}
      </div>

      <p className="mt-2 text-[10px] text-gray-400">
        Auto routing uses Gemini for photography (free), fal.ai for Cinematic 3D (£0.04), and programmatic for text-based images (free).
      </p>
    </div>
  );
}
