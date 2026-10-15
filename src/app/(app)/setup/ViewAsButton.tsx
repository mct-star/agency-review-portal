"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** On a company card: see the platform as that company's people see it. */
export default function ViewAsButton({ companyId, companyName }: { companyId: string; companyName: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/view-as", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companyId }) });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setBusy(false);
      setError(data.error || "Could not start viewing.");
      return;
    }
    router.push("/home");
    router.refresh();
  }

  return (
    <div className="px-5 pb-4">
      <button type="button" onClick={start} disabled={busy} className="min-h-11 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50" aria-label={`View the platform as ${companyName}`}>
        {busy ? "Opening..." : "View as this company"}
      </button>
      {error && <p className="mt-1 text-xs text-red-700">{error}</p>}
    </div>
  );
}
