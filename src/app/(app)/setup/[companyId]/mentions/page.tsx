"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";

interface Mention { id: string; name: string; urn: string; kind: "person" | "organization" }

export default function MentionsPage() {
  const { companyId } = useParams<{ companyId: string }>();
  const [mentions, setMentions] = useState<Mention[]>([]);
  const [name, setName] = useState("");
  const [urn, setUrn] = useState("");
  const [kind, setKind] = useState<"person" | "organization">("person");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/linkedin/mentions?companyId=${companyId}`);
    const json = await res.json().catch(() => ({}));
    if (!res.ok) { setError(json.error || "Could not load the list."); return; }
    setMentions(json.mentions || []);
  }, [companyId]);
  useEffect(() => { void load(); }, [load]);

  async function add() {
    setBusy(true); setError(null);
    const res = await fetch("/api/linkedin/mentions", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ companyId, name, urn, kind }),
    });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setError(json.error || "Could not save."); return; }
    setName(""); setUrn("");
    await load();
  }

  async function remove(id: string) {
    setError(null);
    const res = await fetch("/api/linkedin/mentions", {
      method: "DELETE", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ companyId, id }),
    });
    if (!res.ok) { setError((await res.json().catch(() => ({}))).error || "Could not delete."); return; }
    await load();
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900">LinkedIn mentions</h1>
        <p className="mt-1 text-sm text-gray-600">
          Write a mention in a post as ＠Name. When the post is published, a name in this list becomes a real LinkedIn mention.
          The approved text never changes. A name that is not in the list is published as plain text, and the Deploy week preview warns you.
        </p>
      </div>

      <div className="space-y-2 rounded-lg border border-gray-200 bg-white p-4">
        <label className="block text-sm text-gray-700">Name, exactly as you write it after the ＠
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={100} className="mt-1 block w-full rounded-md border border-gray-300 px-2 py-1 text-sm" />
        </label>
        <label className="block text-sm text-gray-700">Type
          <select value={kind} onChange={(e) => setKind(e.target.value as "person" | "organization")} className="mt-1 block rounded-md border border-gray-300 px-2 py-1 text-sm">
            <option value="person">Person</option>
            <option value="organization">Organisation</option>
          </select>
        </label>
        <label className="block text-sm text-gray-700">URN
          <input value={urn} onChange={(e) => setUrn(e.target.value)} placeholder={kind === "person" ? "urn:li:person:AbCdEf123" : "urn:li:organization:12345"} className="mt-1 block w-full rounded-md border border-gray-300 px-2 py-1 text-sm" />
        </label>
        <button type="button" className="workspace-button" disabled={busy || !name.trim() || !urn.trim()} onClick={add}>
          {busy ? "Saving..." : "Add to the list"}
        </button>
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      </div>

      <ul className="divide-y divide-gray-200 rounded-lg border border-gray-200 bg-white text-sm">
        {mentions.length === 0 && <li className="p-4 text-gray-500">No names yet.</li>}
        {mentions.map((m) => (
          <li key={m.id} className="flex items-center justify-between gap-3 p-3">
            <span><span className="font-medium text-gray-900">{m.name}</span> <span className="text-gray-500">{m.kind === "person" ? "person" : "organisation"}, {m.urn}</span></span>
            <button type="button" onClick={() => remove(m.id)} className="rounded-md border border-gray-300 px-2 py-1 text-xs">Delete</button>
          </li>
        ))}
      </ul>
    </div>
  );
}
