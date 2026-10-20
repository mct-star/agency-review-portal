"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import PublishingWorkspace from "@/components/publishing/PublishingWorkspace";

type CompanyChoice = { id: string; name: string; post_pack?: string | null };

/** Administrators select one company, then use the same explicit publishing journey as its authorised publishers. */
export default function PublishClient({ userId }: { userId: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const [companies, setCompanies] = useState<CompanyChoice[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const requestedCompany = params.get("companyId");

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError("");
    void fetch("/api/companies", { signal: controller.signal, cache: "no-store" }).then(async (response) => {
      if (!response.ok) throw new Error("Could not load companies. Try again.");
      const result = await response.json();
      if (controller.signal.aborted) return;
      const choices = (result.data || []) as CompanyChoice[];
      setCompanies(choices);
      let previous = "";
      try { previous = window.sessionStorage.getItem(`agency:publishing:company:${userId}`) || ""; } catch { /* Selecting remains available. */ }
      const candidate = requestedCompany || previous;
      setSelectedId(choices.some((item) => item.id === candidate) ? candidate : choices.length === 1 ? choices[0].id : "");
    }).catch(() => { if (!controller.signal.aborted) setError("Could not load companies. Try again."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [userId, retry, requestedCompany]);

  function selectCompany(id: string) {
    setSelectedId(id);
    try { window.sessionStorage.setItem(`agency:publishing:company:${userId}`, id); } catch { /* Selection remains in the URL. */ }
    router.replace(id ? `/publish?companyId=${encodeURIComponent(id)}` : "/publish");
  }

  const selected = companies.find((item) => item.id === selectedId);
  return <div className="space-y-6">
    <div><p className="workspace-eyebrow">Review and publish</p><h1 className="workspace-title">Publish content</h1></div>
    <section className="workspace-panel p-5 sm:p-6">
      <label className="block text-sm font-medium">Company<select aria-label="Select company" value={selectedId} onChange={(event) => selectCompany(event.target.value)} disabled={loading} className="mt-2 block min-h-11 w-full max-w-md rounded-lg border border-gray-300 bg-white px-3"><option value="">Choose a company</option>{companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}</select></label>
      {loading && <p className="mt-3 text-sm text-gray-600">Loading companies...</p>}
      {error && <div role="alert" className="mt-3 text-sm text-red-700"><p>{error}</p><button type="button" onClick={() => setRetry((value) => value + 1)} className="min-h-11 underline">Try again</button></div>}
      {!loading && !error && !selected && <p className="mt-3 text-sm text-gray-600">Choose the company whose content you want to publish.</p>}
    </section>
    {selected && !error && <PublishingWorkspace key={selected.id} userId={userId} companyId={selected.id} canPublish isHospitality={selected.post_pack === "hospitality"} />}
  </div>;
}
