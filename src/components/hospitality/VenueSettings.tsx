"use client";

import { useCallback, useEffect, useState } from "react";
import StaffLinkPanel from "@/components/library/StaffLinkPanel";

interface Settings {
  post_pack: "b2b" | "hospitality";
  social_networks: string[];
  hospitality_settings: { venue_notes?: string; standing_hashtags?: string[]; allow_emoji?: boolean };
}

const NETWORK_LABELS: Array<[string, string]> = [
  ["facebook", "Facebook"],
  ["instagram", "Instagram"],
  ["linkedin", "LinkedIn"],
  ["threads", "Threads"],
  ["bluesky", "Bluesky"],
  ["x", "X"],
];

/** Venue and posting settings for a company: the pack, where posts go, how they are written, the team photo link and inviting colleagues. */
export default function VenueSettings({ companyId, children }: { companyId: string; children?: React.ReactNode }) {
  const [s, setS] = useState<Settings | null>(null);
  const [notes, setNotes] = useState("");
  const [tags, setTags] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/company/hospitality?companyId=${companyId}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { setMessage({ text: data.error || "Could not load the settings", ok: false }); return; }
    const d = data.data as Settings;
    setS(d);
    setNotes(d.hospitality_settings?.venue_notes || "");
    setTags((d.hospitality_settings?.standing_hashtags || []).join(" "));
  }, [companyId]);

  useEffect(() => { load(); }, [load]);

  async function save(change: Record<string, unknown>, okText = "Saved") {
    setSaving(true);
    setMessage(null);
    const res = await fetch("/api/company/hospitality", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companyId, ...change }) });
    const data = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) { setMessage({ text: data.error || "That did not save", ok: false }); return; }
    setS(data.data);
    setMessage({ text: okText, ok: true });
  }

  if (!s) return <p className="text-sm text-gray-500">{message?.text || "Loading..."}</p>;
  const hospitality = s.post_pack === "hospitality";

  return (
    <div className="max-w-2xl space-y-8">
      {message && <p className={`rounded px-3 py-2 text-sm ${message.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700"}`} role="status">{message.text}</p>}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-gray-900">What kind of posts</h2>
        <div className="space-y-2">
          {([
            ["hospitality", "Hospitality", "Facebook and Instagram posts for a restaurant, bar or hotel: the weather, the special, what is on, live scenes and events."],
            ["b2b", "Business to business", "LinkedIn posts for a professional audience."],
          ] as const).map(([value, label, hint]) => (
            <label key={value} className={`flex cursor-pointer gap-3 rounded-lg border p-3 ${s.post_pack === value ? "border-violet-500 bg-violet-50" : "border-gray-200 bg-white"}`}>
              <input type="radio" name="pack" checked={s.post_pack === value} onChange={() => save({ post_pack: value }, "Changed. The menu will update when you next open a page.")} className="mt-1" />
              <span><span className="block text-sm font-medium text-gray-900">{label}</span><span className="block text-xs text-gray-600">{hint}</span></span>
            </label>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-gray-900">Where your posts go</h2>
        <p className="text-sm text-gray-600">When you export a week, each post is marked for these networks.</p>
        <div className="flex flex-wrap gap-2">
          {NETWORK_LABELS.map(([id, label]) => {
            const on = s.social_networks.includes(id);
            return (
              <button key={id} type="button" aria-pressed={on} disabled={saving}
                onClick={() => save({ social_networks: on ? s.social_networks.filter((n) => n !== id) : [...s.social_networks, id] })}
                className={`rounded-full border px-3 py-1 text-sm ${on ? "border-violet-600 bg-violet-600 text-white" : "border-gray-300 bg-white text-gray-700"}`}>
                {label}
              </button>
            );
          })}
        </div>
        {s.social_networks.length === 0 && <p className="text-xs text-gray-500">None chosen, so posts are marked for LinkedIn only.</p>}
      </section>

      {hospitality && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-gray-900">How posts are written</h2>
          <label className="block text-sm">
            <span className="font-medium text-gray-800">About the venue, in your own words</span>
            <span className="block text-xs text-gray-500">The only things the writer will say about your place come from here and from what you tell it for each post.</span>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={4} maxLength={1000} className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2" />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-gray-800">Hashtags to add to every post</span>
            <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="#YourTown #YourVenue" className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2" />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={!!s.hospitality_settings.allow_emoji} onChange={(e) => save({ hospitality_settings: { allow_emoji: e.target.checked } })} />
            <span>Allow a couple of emoji in posts</span>
          </label>
          <button disabled={saving} onClick={() => save({ hospitality_settings: { venue_notes: notes, standing_hashtags: tags.split(/[\s,]+/).filter(Boolean) } })} className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50">
            {saving ? "Saving..." : "Save"}
          </button>
        </section>
      )}

      {children}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-gray-900">Photos from your team</h2>
        <StaffLinkPanel companyId={companyId} />
      </section>

      <InviteColleague companyId={companyId} />
    </div>
  );
}

function InviteColleague({ companyId }: { companyId: string }) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const res = await fetch("/api/company/invite", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, fullName: name || undefined, companyId }) });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setMsg({ text: data.error || "That did not work", ok: false }); return; }
    setMsg(data.emailSent
      ? { text: `We have emailed ${email}. The link in the email works once.`, ok: true }
      : { text: `They are set up, but the email could not be sent${data.signInUrl ? `. Give them this link: ${data.signInUrl}` : ". Ask us to send it."}`, ok: false });
    if (data.emailSent) { setEmail(""); setName(""); }
  }

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold text-gray-900">Add a colleague</h2>
      <p className="text-sm text-gray-600">They get an email with a link to sign in. They can approve posts and add photos.</p>
      <form onSubmit={invite} className="flex flex-wrap gap-2">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" aria-label="Their name" className="w-40 rounded-md border border-gray-300 px-3 py-2 text-sm" />
        <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required placeholder="their@email.com" aria-label="Their email" className="min-w-[220px] flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm" />
        <button disabled={busy} className="rounded-md bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-50">{busy ? "Sending..." : "Send invitation"}</button>
      </form>
      {msg && <p className={`text-sm ${msg.ok ? "text-emerald-700" : "text-red-700"}`} role="status">{msg.text}</p>}
    </section>
  );
}
