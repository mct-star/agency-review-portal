"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import CompanyConnections from "@/components/connections/CompanyConnections";
import { stepsForPack, type SetupStep } from "@/lib/onboarding/progress";
import type { SetupCompany, SetupReadiness } from "@/lib/onboarding/readiness";
import { clearConnectionReturn } from "@/lib/connections/return-context";

const labels: Record<SetupStep, string> = { brand: "Brand basics", voice: "Writing voice", connections: "Social accounts", create: "First post" };

/** Resumable first setup; edits the same company settings and connections used after onboarding. */
export default function WorkspaceSetup({ company, userId, initialStep, readiness, canConnect, canPublish, readOnly = false }: {
  company: SetupCompany;
  userId: string;
  initialStep: SetupStep;
  readiness: SetupReadiness;
  canConnect: boolean;
  canPublish: boolean;
  readOnly?: boolean;
}) {
  const router = useRouter();
  const hospitality = company.post_pack === "hospitality";
  const steps = stepsForPack(hospitality);
  const [step, setStep] = useState<SetupStep>(steps.includes(initialStep) ? initialStep : "brand");
  const [name, setName] = useState(company.name || "");
  const [website, setWebsite] = useState(company.blog_base_url || company.website_url || "");
  const [description, setDescription] = useState(company.description || "");
  const [voice, setVoice] = useState("");
  const [samples, setSamples] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(url: string, method: string, body: object) {
    const response = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Your changes were not saved. Try again.");
  }

  async function changeStep(next: SetupStep) {
    if (!readOnly) await save("/api/onboarding/progress", "PATCH", { companyId: company.id, step: next });
    if (next !== "connections") clearConnectionReturn(userId, company.id);
    setStep(next);
  }

  async function move(next: SetupStep) {
    setBusy(true);
    setError(null);
    try { await changeStep(next); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Your progress was not saved. Try again."); }
    finally { setBusy(false); }
  }

  async function saveBrand() {
    if (!name.trim() || !description.trim()) { setError("Add your company name and a short description."); return; }
    setBusy(true);
    setError(null);
    try {
      await save("/api/config/company/details", "PATCH", { companyId: company.id, name: name.trim(), description: description.trim(), blog_base_url: website.trim() || null });
      await changeStep(hospitality ? "connections" : "voice");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Your brand details were not saved. Try again."); }
    finally { setBusy(false); }
  }

  async function saveVoice() {
    setBusy(true);
    setError(null);
    try {
      await save("/api/config/voice", "POST", { companyId: company.id, voice_description: voice.trim() || null, writing_samples: samples.trim() || null, source: "manual" });
      await changeStep("connections");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Your voice details were not saved. Try again."); }
    finally { setBusy(false); }
  }

  async function createPost() {
    setBusy(true);
    setError(null);
    try {
      if (!readOnly) await save("/api/onboarding/progress", "PATCH", { companyId: company.id, step: "create" });
      clearConnectionReturn(userId, company.id);
      router.push(`/generate/quick?company=${encodeURIComponent(company.id)}`);
      router.refresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Your progress was not saved. Try again."); }
    finally { setBusy(false); }
  }

  return <div className="mx-auto max-w-4xl space-y-6 pb-10">
    <div>
      <p className="workspace-eyebrow">Workspace setup</p>
      <h2 className="workspace-title">Set up once, refine any time</h2>
      <p className="workspace-description">Your team shares these settings. Each step is saved as you continue. You can create a post before connecting social accounts.</p>
    </div>
    {readOnly && <p className="rounded-lg bg-amber-50 p-4 text-sm text-amber-900">You are viewing this company's setup. Stop viewing to make changes.</p>}
    <nav aria-label="Setup steps" className="flex flex-wrap gap-2">
      {steps.map((item, index) => <button key={item} type="button" disabled={busy} onClick={() => move(item)} aria-current={step === item ? "step" : undefined}
        className={`min-h-11 rounded-lg border px-4 py-2 text-sm font-medium ${step === item ? "border-violet-500 bg-violet-50 text-violet-800" : "border-gray-200 bg-white text-gray-600"}`}>
        {index + 1}. {labels[item]}
      </button>)}
    </nav>
    {error && <p role="alert" className="rounded-lg bg-red-50 p-4 text-sm text-red-800">{error}</p>}
    {readiness.unavailable && <p role="status" className="rounded-lg bg-amber-50 p-4 text-sm text-amber-900">Some existing settings could not be checked. Your saved settings are still available in Settings.</p>}

    {step === "brand" && <section className="workspace-panel space-y-5 p-5 sm:p-6" aria-labelledby="setup-brand">
      <h3 id="setup-brand" className="workspace-section-title">The essentials for your content</h3>
      <p className="text-sm text-gray-600">Confirm what is already here. Add a short description of what you do and who you help.</p>
      <label className="block text-sm font-medium">Company name
        <input className="mt-1 min-h-11 w-full rounded-lg border border-gray-300 px-3 py-2" value={name} onChange={(event) => setName(event.target.value)} disabled={busy || readOnly} required />
      </label>
      <label className="block text-sm font-medium">What you do and who you help
        <textarea className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2" rows={3} value={description} onChange={(event) => setDescription(event.target.value)} disabled={busy || readOnly} required />
      </label>
      <label className="block text-sm font-medium">Website (optional)
        <input type="url" className="mt-1 min-h-11 w-full rounded-lg border border-gray-300 px-3 py-2" value={website} onChange={(event) => setWebsite(event.target.value)} disabled={busy || readOnly} />
      </label>
      <div className="flex flex-wrap gap-3">
        {!readOnly && <button type="button" disabled={busy} onClick={saveBrand} className="workspace-button">{busy ? "Saving..." : "Save and continue"}</button>}
        <button type="button" disabled={busy} onClick={() => move(hospitality ? "connections" : "voice")} className="workspace-button workspace-button-secondary">Continue with current settings</button>
      </div>
    </section>}

    {step === "voice" && !hospitality && <section className="workspace-panel space-y-5 p-5 sm:p-6" aria-labelledby="setup-voice">
      <h3 id="setup-voice" className="workspace-section-title">Help your content sound like you</h3>
      {readiness.voice ? <>
        <p className="text-sm text-gray-600">Your company already has a writing voice. Your team can use it without setting it up again.</p>
        <Link href={`/setup/${company.id}/voice`} className="inline-flex min-h-11 items-center text-sm font-medium text-violet-700 underline">Review writing voice in Settings</Link>
      </> : <>
        <p className="text-sm text-gray-600">Describe your preferred style or add a writing sample. You can refine this in Settings later.</p>
        <label className="block text-sm font-medium">How should your writing sound? (optional)
          <textarea className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2" rows={3} value={voice} onChange={(event) => setVoice(event.target.value)} disabled={busy || readOnly} />
        </label>
        <label className="block text-sm font-medium">Writing sample (optional)
          <textarea className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2" rows={4} value={samples} onChange={(event) => setSamples(event.target.value)} disabled={busy || readOnly} />
        </label>
      </>}
      <div className="flex flex-wrap gap-3">
        {!readiness.voice && !readOnly && <button type="button" disabled={busy || (!voice.trim() && !samples.trim())} onClick={saveVoice} className="workspace-button">{busy ? "Saving..." : "Save and continue"}</button>}
        <button type="button" disabled={busy} onClick={() => move("connections")} className="workspace-button workspace-button-secondary">{readiness.voice ? "Continue" : "Skip for now"}</button>
      </div>
    </section>}

    {step === "connections" && <section className="space-y-5" aria-labelledby="setup-connections">
      <div><h3 id="setup-connections" className="workspace-section-title">Connect where you want to publish</h3>
        <p className="mt-1 text-sm text-gray-600">Connect now or skip this step. Manage these accounts later in Settings, Connections.</p></div>
      <CompanyConnections companyId={company.id} canConnect={canConnect && !readOnly} canPublish={canPublish && !readOnly} isHospitality={hospitality} userId={userId} returnTarget="setup" />
      <button type="button" disabled={busy} onClick={() => move("create")} className="workspace-button">Continue to your first post</button>
    </section>}

    {step === "create" && <section className="workspace-panel space-y-5 p-5 sm:p-6" aria-labelledby="setup-create">
      <h3 id="setup-create" className="workspace-section-title">Start with a draft</h3>
      <p className="text-sm text-gray-600">Create a post, review it and approve it. Publishing is a separate step after approval.</p>
      {!readiness.connections && <p className="text-sm text-gray-600">You can connect social accounts later in Settings, Connections.</p>}
      <button type="button" disabled={busy} onClick={createPost} className="workspace-button">{busy ? "Saving..." : "Create a post"}</button>
    </section>}
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-200 pt-4">
      {step !== steps[0] && <button type="button" disabled={busy} className="workspace-button workspace-button-secondary" onClick={() => move(steps[steps.indexOf(step) - 1])}>Back</button>}
      <Link href="/home" onClick={() => clearConnectionReturn(userId, company.id)} className="inline-flex min-h-11 items-center text-sm text-gray-600 underline">Continue later from Home</Link>
    </div>
  </div>;
}
