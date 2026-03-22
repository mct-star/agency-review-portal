"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import ImageStyleSelector from "@/components/setup/ImageStyleSelector";

export default function BrandStylePage() {
  const { companyId } = useParams<{ companyId: string }>();
  const [styles, setStyles] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    async function load() {
      const res = await fetch(`/api/config/image-styles?companyId=${companyId}`);
      const data = await res.json();
      setStyles(data.styles || []);
      setLoading(false);
    }
    load();
  }, [companyId]);

  async function handleSave(selectedStyles: string[]) {
    setSaving(true);
    setMessage(null);

    const res = await fetch("/api/config/image-styles", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ companyId, styles: selectedStyles }),
    });

    setSaving(false);

    if (res.ok) {
      setStyles(selectedStyles);
      setMessage({ type: "success", text: "Image style preferences saved" });
    } else {
      const data = await res.json();
      setMessage({ type: "error", text: data.error || "Failed to save" });
    }
  }

  if (loading) {
    return <div className="text-center text-sm text-gray-400 py-12">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      {message && (
        <div
          className={`rounded-lg px-4 py-3 text-sm ${
            message.type === "success" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
          }`}
        >
          {message.text}
        </div>
      )}

      <ImageStyleSelector
        selectedStyles={styles}
        onSave={handleSave}
        saving={saving}
      />
    </div>
  );
}
