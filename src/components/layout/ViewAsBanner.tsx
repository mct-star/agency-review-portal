"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** Shown to an admin while the pages are rendered as one company sees them. */
export default function ViewAsBanner({ companyName }: { companyName: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function stop() {
    setBusy(true);
    await fetch("/api/view-as", { method: "DELETE" });
    router.push("/setup");
    router.refresh();
  }

  return (
    <div role="status" className="flex flex-wrap items-center justify-between gap-2 border-b border-violet-200 bg-violet-50 px-4 py-2 text-sm text-violet-900">
      <span>
        Viewing as <strong>{companyName}</strong>. You see what they see. Anything you do here is recorded as you, not them.
      </span>
      <button type="button" onClick={stop} disabled={busy} className="min-h-11 rounded-lg border border-violet-300 bg-white px-4 text-sm font-medium text-violet-800 hover:bg-violet-100 disabled:opacity-50">
        Stop viewing
      </button>
    </div>
  );
}
