"use client";

import { useCallback, useEffect, useState } from "react";
import StaffLinkPanel from "@/components/library/StaffLinkPanel";

interface Settings {
  post_pack: "b2b" | "hospitality";
  social_networks: string[];
  hospitality_settings: { venue_notes?: string; standing_hashtags?: string[]; allow_emoji?: boolean };
  postcode: string | null;
  latitude: number | null;
  longitude: number | null;
  timezone: string;
  weather_post_enabled: boolean;
  weather_post_time: string;
  weather_post_for: "today" | "tomorrow";
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
export default function VenueSettings({ companyId, canChangePack = false, children }: { companyId: string; canChangePack?: boolean; children?: React.ReactNode }) {
  const [s, setS] = useState<Settings | null>(null);
  const [notes, setNotes] = useState("");
  const [tags, setTags] = useState("");
  const [postcode, setPostcode] = useState("");
  const [lookupNote, setLookupNote] = useState<string | null>(null);
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
    setPostcode(d.postcode || "");
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
        {!canChangePack && (
          <p className="rounded-lg border border-gray-200 bg-white p-3 text-sm text-gray-700">
            <span className="font-medium text-gray-900">{hospitality ? "Hospitality" : "Business to business"}.</span>{" "}
            {hospitality
              ? "Facebook and Instagram posts for a restaurant, bar or hotel: the weather, the special, what is on, live scenes and events."
              : "LinkedIn posts for a professional audience."}{" "}
            AGENCY sets this. Ask us if it should change.
          </p>
        )}
        <div className={canChangePack ? "space-y-2" : "hidden"}>
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

      {hospitality && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-gray-900">Daily weather post</h2>
          <p className="text-sm text-gray-600">Each morning we write a short weather post from the forecast for your venue, pick a matching photo from your library, and leave it for you to approve. Nothing is posted until you do.</p>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={s.weather_post_enabled} disabled={saving || s.latitude === null} onChange={(e) => save({ weather_post_enabled: e.target.checked }, e.target.checked ? "The daily weather post is on." : "The daily weather post is off.")} />
            <span>Draft a weather post every day</span>
          </label>
          {s.latitude === null && <p className="text-xs text-amber-800">Add the venue's postcode below first, so we know where to look up the weather.</p>}

          <div className="flex flex-wrap items-end gap-2">
            <label className="block text-sm">
              <span className="block font-medium text-gray-800">Venue postcode</span>
              <input value={postcode} onChange={(e) => setPostcode(e.target.value)} className="mt-1 w-36 rounded-md border border-gray-300 px-3 py-2 uppercase" />
            </label>
            <button type="button" disabled={saving || !postcode.trim()} onClick={async () => {
              setLookupNote(null);
              const res = await fetch(`/api/company/postcode?postcode=${encodeURIComponent(postcode)}`);
              const data = await res.json().catch(() => ({}));
              if (!res.ok) { setLookupNote(data.error || "Could not look that up"); return; }
              await save({ postcode: data.postcode, latitude: data.latitude, longitude: data.longitude }, `Position set${data.area ? ` near ${data.area}` : ""}.`);
            }} className="rounded-md bg-gray-900 px-3 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50">Find the position</button>
          </div>
          {lookupNote && <p className="text-xs text-red-700">{lookupNote}</p>}
          {s.latitude !== null && s.longitude !== null && <p className="text-xs text-gray-600">Looking up the weather at {s.latitude.toFixed(4)}, {s.longitude.toFixed(4)}{s.postcode ? ` (${s.postcode})` : ""}.</p>}

          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block text-sm">
              <span className="font-medium text-gray-800">Post time</span>
              <input type="time" value={s.weather_post_time.slice(0, 5)} onChange={(e) => e.target.value && save({ weather_post_time: e.target.value })} className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2" />
            </label>
            <label className="block text-sm">
              <span className="font-medium text-gray-800">Draft it</span>
              <select value={s.weather_post_for} onChange={(e) => save({ weather_post_for: e.target.value })} className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2">
                <option value="today">On the morning</option>
                <option value="tomorrow">A day ahead</option>
              </select>
            </label>
            <label className="block text-sm">
              <span className="font-medium text-gray-800">Time zone</span>
              <input defaultValue={s.timezone} onBlur={(e) => e.target.value !== s.timezone && save({ timezone: e.target.value })} className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2" />
            </label>
          </div>
          <p className="text-xs text-gray-500">&quot;A day ahead&quot; drafts tomorrow&apos;s forecast today, so you can approve and export it before it is due.</p>
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
