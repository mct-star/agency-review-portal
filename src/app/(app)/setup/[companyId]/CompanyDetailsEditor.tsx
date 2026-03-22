"use client";

import { useState } from "react";

interface CompanyDetailsEditorProps {
  companyId: string;
  initialName: string;
  initialTagline: string | null;
  initialWebsite: string | null;
  initialBrandColor: string | null;
  initialDescription: string | null;
  initialBrandPalette?: string[];
  initialIndustry?: string;
}

export default function CompanyDetailsEditor({
  companyId,
  initialName,
  initialTagline,
  initialWebsite,
  initialBrandColor,
  initialDescription,
  initialBrandPalette = [],
  initialIndustry = "",
}: CompanyDetailsEditorProps) {
  const [name, setName] = useState(initialName);
  const [tagline, setTagline] = useState(initialTagline || "");
  const [website, setWebsite] = useState(initialWebsite || "");
  const [brandColor, setBrandColor] = useState(initialBrandColor || "#0ea5e9");
  const [description, setDescription] = useState(initialDescription || "");
  const [industry, setIndustry] = useState(initialIndustry);
  const [brandPalette, setBrandPalette] = useState<string[]>(initialBrandPalette);
  const [newPaletteColor, setNewPaletteColor] = useState("#7C3AED");
  const [saving, setSaving] = useState(false);
  const [enriching, setEnriching] = useState(false);
  const [message, setMessage] = useState("");

  const handleSave = async () => {
    setSaving(true);
    setMessage("");
    try {
      const res = await fetch("/api/config/company/details", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId,
          name,
          tagline: tagline || null,
          blog_base_url: website || null,
          brand_color: brandColor || null,
          industry: industry || null,
          brand_palette: brandPalette.length > 0 ? brandPalette : null,
          description: description || null,
        }),
      });
      if (!res.ok) throw new Error("Save failed");
      setMessage("Company details saved");

      // Auto-enrich from website if URL was provided and we're missing data
      const websiteChanged = website && website !== initialWebsite;
      const missingData = !description || !tagline;
      if (website && (websiteChanged || missingData)) {
        setEnriching(true);
        setMessage("Enriching from website...");
        try {
          const enrichRes = await fetch("/api/config/company/enrich", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ websiteUrl: website }),
          });
          if (enrichRes.ok) {
            const data = await enrichRes.json();
            const updates: Record<string, unknown> = { companyId };
            const enrichedFields: string[] = [];

            if (data.description && !description) {
              updates.description = data.description;
              setDescription(data.description);
              enrichedFields.push("description");
            }
            if (data.tagline && !tagline) {
              updates.tagline = data.tagline;
              setTagline(data.tagline);
              enrichedFields.push("tagline");
            }

            if (enrichedFields.length > 0) {
              await fetch("/api/config/company/details", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(updates),
              });
              setMessage(`Saved. Auto-filled from website: ${enrichedFields.join(", ")}`);
            } else {
              setMessage("Company details saved");
            }
          }
        } catch {
          // Enrichment is non-critical
        } finally {
          setEnriching(false);
        }
      }
    } catch {
      setMessage("Error saving details");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Company Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Tagline</label>
          <input
            type="text"
            value={tagline}
            onChange={(e) => setTagline(e.target.value)}
            placeholder="e.g. Healthcare Demand Generation"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none"
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Industry / Sector</label>
          <select
            value={industry}
            onChange={(e) => setIndustry(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none"
          >
            <option value="">Select industry...</option>
            <option value="healthcare">Healthcare / Life Sciences</option>
            <option value="pharma">Pharmaceuticals / Medical Devices</option>
            <option value="fintech">Fintech / Financial Services</option>
            <option value="saas">SaaS / Technology</option>
            <option value="construction">Construction / Property</option>
            <option value="legal">Legal / Professional Services</option>
            <option value="education">Education / Training</option>
            <option value="hospitality">Hospitality / Leisure</option>
            <option value="manufacturing">Manufacturing / Engineering</option>
            <option value="retail">Retail / E-commerce</option>
            <option value="energy">Energy / Sustainability</option>
            <option value="other">Other</option>
          </select>
          <p className="mt-1 text-[10px] text-gray-400">
            Shapes content context, scene quotes, and compliance frameworks.
          </p>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Website URL</label>
          <input
            type="url"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
            placeholder="https://yourcompany.com"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Primary Brand Colour</label>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={brandColor}
              onChange={(e) => setBrandColor(e.target.value)}
              className="h-9 w-9 cursor-pointer rounded border border-gray-300 p-0.5"
            />
            <input
              type="text"
              value={brandColor}
              onChange={(e) => setBrandColor(e.target.value)}
              placeholder="#0ea5e9"
              className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm font-mono focus:border-sky-500 focus:outline-none"
            />
            <div
              className="h-9 w-20 rounded border border-gray-200"
              style={{ backgroundColor: brandColor }}
            />
          </div>
          <p className="mt-1 text-[10px] text-gray-400">
            Used as the default colour for quote cards and carousels. Set per-post-type colours in{" "}
            <a href={`/setup/${companyId}/image-mapping`} className="text-violet-600 underline">Image Mapping</a>.
          </p>
        </div>
      </div>

      {/* Brand Colour Palette */}
      <div>
        <label className="mb-2 block text-xs font-medium text-gray-600">
          Brand Colour Palette
          <span className="ml-1 font-normal text-gray-400">(used for quote cards, carousels, accents)</span>
        </label>
        <div className="flex flex-wrap items-center gap-2">
          {brandPalette.map((color, i) => (
            <div key={i} className="group relative">
              <div
                className="h-10 w-10 rounded-lg border-2 border-white shadow-sm cursor-pointer transition-transform hover:scale-110"
                style={{ backgroundColor: color }}
                title={color}
              />
              <button
                onClick={() => setBrandPalette(brandPalette.filter((_, j) => j !== i))}
                className="absolute -top-1 -right-1 hidden h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[8px] font-bold text-white group-hover:flex"
                title="Remove"
              >
                x
              </button>
              <span className="mt-0.5 block text-center text-[9px] font-mono text-gray-400">{color}</span>
            </div>
          ))}
          {brandPalette.length < 8 && (
            <div className="flex items-center gap-1.5">
              <input
                type="color"
                value={newPaletteColor}
                onChange={(e) => setNewPaletteColor(e.target.value)}
                className="h-10 w-10 cursor-pointer rounded-lg border border-dashed border-gray-300 p-0.5"
              />
              <button
                onClick={() => {
                  if (newPaletteColor && !brandPalette.includes(newPaletteColor)) {
                    setBrandPalette([...brandPalette, newPaletteColor]);
                  }
                }}
                className="rounded-md border border-gray-300 px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors"
              >
                + Add
              </button>
            </div>
          )}
        </div>
        {brandPalette.length === 0 && (
          <p className="mt-2 text-[10px] text-gray-400">
            No palette colours set. Quote cards will use vibrant defaults. Add your brand colours for on-brand cards.
          </p>
        )}
        {brandPalette.length > 0 && (
          <p className="mt-2 text-[10px] text-gray-400">
            {brandPalette.length} colour{brandPalette.length !== 1 ? "s" : ""} in palette. These are assigned to post types automatically (or manually in Image Mapping).
          </p>
        )}
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-gray-600">Company Description</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          placeholder="Brief description of what your company does. This helps AI generate more relevant content."
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none"
        />
      </div>

      {message && (
        <p className={`text-sm ${message.includes("Error") ? "text-red-600" : "text-green-600"}`}>
          {message}
        </p>
      )}

      <button
        onClick={handleSave}
        disabled={saving || enriching || !name}
        className="rounded-md bg-gray-900 px-6 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
      >
        {enriching ? "Enriching from website..." : saving ? "Saving..." : "Save Details"}
      </button>
    </div>
  );
}
