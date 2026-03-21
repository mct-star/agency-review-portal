"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Mode = "choose" | "manual" | "linkedin";

export default function AddCompanyButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("choose");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Manual form
  const [form, setForm] = useState({
    name: "",
    spokespersonName: "",
    brandColor: "#0ea5e9",
  });

  // Quick setup form
  const [linkedinUrl, setLinkedinUrl] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [enrichResult, setEnrichResult] = useState<{
    companyId: string;
    companyName: string;
    enrichedData: {
      personName: string;
      personTagline: string | null;
      personPhoto: string | null;
      companyLogo: string | null;
      brandColor: string | null;
      companyDescription: string | null;
    };
  } | null>(null);

  const handleReset = () => {
    setOpen(false);
    setMode("choose");
    setSaving(false);
    setError(null);
    setForm({ name: "", spokespersonName: "", brandColor: "#0ea5e9" });
    setLinkedinUrl("");
    setWebsiteUrl("");
    setEnrichResult(null);
  };

  const handleCreateManual = async () => {
    if (!form.name) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/companies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (res.ok && data.data?.id) {
        router.push(`/setup/${data.data.id}`);
      } else {
        setError(data.error || "Failed to create company");
      }
    } catch {
      setError("Network error");
    } finally {
      setSaving(false);
    }
  };

  const handleQuickSetup = async () => {
    if (!linkedinUrl) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/setup/quick", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ linkedinUrl, websiteUrl: websiteUrl || undefined }),
      });
      const data = await res.json();
      if (res.ok) {
        setEnrichResult(data);
      } else {
        setError(data.error || "Quick setup failed");
      }
    } catch {
      setError("Network error");
    } finally {
      setSaving(false);
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-gray-800"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
        </svg>
        Add Company
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-lg rounded-xl bg-white shadow-2xl">
        {/* ── Mode chooser ──────────────────────────────── */}
        {mode === "choose" && (
          <div className="p-6">
            <h2 className="text-lg font-bold text-gray-900">Add a Company</h2>
            <p className="mt-1 text-sm text-gray-500">
              How would you like to set up the company?
            </p>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {/* Quick setup */}
              <button
                onClick={() => setMode("linkedin")}
                className="group rounded-lg border-2 border-gray-200 p-4 text-left transition-all hover:border-sky-400 hover:bg-sky-50/50"
              >
                <div className="flex items-center gap-2">
                  <svg className="h-5 w-5 text-sky-600" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14m-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.32 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93h2.79M6.88 8.56a1.68 1.68 0 0 0 1.68-1.68c0-.93-.75-1.69-1.68-1.69a1.69 1.69 0 0 0-1.69 1.69c0 .93.76 1.68 1.69 1.68m1.39 9.94v-8.37H5.5v8.37h2.77z"/>
                  </svg>
                  <span className="text-sm font-semibold text-gray-900">Quick Setup</span>
                </div>
                <p className="mt-2 text-xs text-gray-500">
                  Enter a LinkedIn URL and we'll auto-fill the company name, spokesperson, photo, and brand info.
                </p>
                <p className="mt-2 text-[10px] font-medium text-sky-600 opacity-0 group-hover:opacity-100 transition-opacity">
                  Recommended →
                </p>
              </button>

              {/* Manual */}
              <button
                onClick={() => setMode("manual")}
                className="group rounded-lg border-2 border-gray-200 p-4 text-left transition-all hover:border-gray-400"
              >
                <div className="flex items-center gap-2">
                  <svg className="h-5 w-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                  <span className="text-sm font-semibold text-gray-900">Manual Setup</span>
                </div>
                <p className="mt-2 text-xs text-gray-500">
                  Enter company details manually. You can always add LinkedIn later.
                </p>
              </button>
            </div>

            <div className="mt-4 flex justify-end">
              <button
                onClick={handleReset}
                className="text-sm text-gray-400 hover:text-gray-600"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* ── Quick Setup (LinkedIn) ────────────────────── */}
        {mode === "linkedin" && !enrichResult && (
          <div className="p-6">
            <div className="flex items-center gap-2">
              <button onClick={() => setMode("choose")} className="text-gray-400 hover:text-gray-600">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <h2 className="text-lg font-bold text-gray-900">Quick Setup</h2>
            </div>
            <p className="mt-1 text-sm text-gray-500">
              We'll pull the spokesperson's name, photo, tagline, and company info from LinkedIn.
            </p>

            <div className="mt-4 space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  LinkedIn Profile URL <span className="text-red-400">*</span>
                </label>
                <input
                  type="url"
                  value={linkedinUrl}
                  onChange={(e) => setLinkedinUrl(e.target.value)}
                  placeholder="https://linkedin.com/in/janedoe"
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Company Website <span className="text-gray-400 text-xs font-normal">(optional)</span>
                </label>
                <input
                  type="url"
                  value={websiteUrl}
                  onChange={(e) => setWebsiteUrl(e.target.value)}
                  placeholder="https://example.com"
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none"
                />
                <p className="mt-1 text-[11px] text-gray-400">
                  Helps us extract brand colour and logo
                </p>
              </div>
            </div>

            {error && (
              <div className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
            )}

            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={handleReset}
                className="rounded-md border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleQuickSetup}
                disabled={saving || !linkedinUrl.trim()}
                className="flex items-center gap-2 rounded-md bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-50"
              >
                {saving ? (
                  <>
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                    Enriching...
                  </>
                ) : (
                  "Set Up from LinkedIn"
                )}
              </button>
            </div>
          </div>
        )}

        {/* ── Quick Setup — Success ─────────────────────── */}
        {mode === "linkedin" && enrichResult && (
          <div className="p-6">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-green-100">
                <svg className="h-4 w-4 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-lg font-bold text-gray-900">Company Created</h2>
            </div>

            <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 p-4">
              <div className="flex items-start gap-4">
                {/* Logo or initials */}
                {enrichResult.enrichedData.companyLogo ? (
                  <img
                    src={enrichResult.enrichedData.companyLogo}
                    alt={enrichResult.companyName}
                    className="h-12 w-12 rounded-lg object-contain border border-gray-200 bg-white"
                  />
                ) : (
                  <div
                    className="flex h-12 w-12 items-center justify-center rounded-lg text-sm font-bold text-white"
                    style={{ backgroundColor: enrichResult.enrichedData.brandColor || "#94a3b8" }}
                  >
                    {enrichResult.companyName.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)}
                  </div>
                )}

                <div className="flex-1 min-w-0">
                  <p className="text-base font-bold text-gray-900">{enrichResult.companyName}</p>
                  {enrichResult.enrichedData.companyDescription && (
                    <p className="mt-0.5 text-xs text-gray-500 line-clamp-2">
                      {enrichResult.enrichedData.companyDescription}
                    </p>
                  )}
                </div>
              </div>

              {/* Spokesperson */}
              <div className="mt-3 flex items-center gap-3 rounded-md bg-white border border-gray-200 px-3 py-2">
                {enrichResult.enrichedData.personPhoto ? (
                  <img
                    src={enrichResult.enrichedData.personPhoto}
                    alt={enrichResult.enrichedData.personName}
                    className="h-9 w-9 rounded-full object-cover border border-gray-200"
                  />
                ) : (
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-200 text-[10px] font-bold text-gray-500">
                    {enrichResult.enrichedData.personName.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)}
                  </div>
                )}
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    {enrichResult.enrichedData.personName}
                    <span className="ml-2 rounded-full bg-sky-100 px-1.5 py-0.5 text-[9px] font-semibold text-sky-700">
                      Primary
                    </span>
                  </p>
                  {enrichResult.enrichedData.personTagline && (
                    <p className="text-[11px] text-gray-500 line-clamp-1">{enrichResult.enrichedData.personTagline}</p>
                  )}
                </div>
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={handleReset}
                className="rounded-md border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
              >
                Close
              </button>
              <button
                onClick={() => router.push(`/setup/${enrichResult.companyId}`)}
                className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
              >
                Continue Setup →
              </button>
            </div>
          </div>
        )}

        {/* ── Manual Setup ──────────────────────────────── */}
        {mode === "manual" && (
          <div className="p-6">
            <div className="flex items-center gap-2">
              <button onClick={() => setMode("choose")} className="text-gray-400 hover:text-gray-600">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <h2 className="text-lg font-bold text-gray-900">Manual Setup</h2>
            </div>
            <p className="mt-1 text-sm text-gray-500">
              Enter company details manually.
            </p>

            <div className="mt-4 space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700">Company Name</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. Acme Healthcare"
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Primary Spokesperson</label>
                <input
                  type="text"
                  value={form.spokespersonName}
                  onChange={(e) => setForm({ ...form, spokespersonName: e.target.value })}
                  placeholder="e.g. Jane Smith"
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Brand Colour</label>
                <div className="mt-1 flex items-center gap-2">
                  <input
                    type="color"
                    value={form.brandColor}
                    onChange={(e) => setForm({ ...form, brandColor: e.target.value })}
                    className="h-9 w-9 cursor-pointer rounded border border-gray-200"
                  />
                  <input
                    type="text"
                    value={form.brandColor}
                    onChange={(e) => setForm({ ...form, brandColor: e.target.value })}
                    className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none"
                  />
                </div>
              </div>
            </div>

            {error && (
              <div className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
            )}

            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={handleReset}
                className="rounded-md border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateManual}
                disabled={saving || !form.name}
                className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
              >
                {saving ? "Creating..." : "Create Company"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
