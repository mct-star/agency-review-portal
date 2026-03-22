"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import type { SocialPlatform } from "@/types/database";
import type { StructuredVoice } from "@/types/voice";
import StructuredVoiceForm from "@/components/setup/StructuredVoiceForm";

// ============================================================
// Types
// ============================================================

interface Spokesperson {
  id: string;
  name: string;
  tagline: string | null;
  profile_picture_url: string | null;
  linkedin_url: string | null;
  is_primary: boolean;
}

interface VoiceProfile {
  id?: string;
  voice_description: string;
  writing_samples: string;
  banned_vocabulary: string;
  signature_devices: string;
  emotional_register: string;
  source: string;
  structured_voice?: StructuredVoice | null;
}

interface SocialAccount {
  id: string;
  platform: SocialPlatform;
  account_name: string | null;
  account_id: string | null;
  has_tokens: boolean;
  is_active: boolean;
}

// Personal platforms — these are the ones that make sense per-person
const PERSONAL_PLATFORMS: { value: SocialPlatform; label: string; icon: string }[] = [
  { value: "linkedin_personal", label: "LinkedIn (Personal)", icon: "in" },
  { value: "twitter", label: "Twitter / X", icon: "X" },
  { value: "bluesky", label: "Bluesky", icon: "BS" },
  { value: "threads", label: "Threads", icon: "Th" },
  { value: "instagram", label: "Instagram", icon: "Ig" },
];

// ============================================================
// Component
// ============================================================

export default function PersonDetailPage() {
  const { companyId, personId } = useParams<{ companyId: string; personId: string }>();
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Profile state
  const [person, setPerson] = useState<Spokesperson | null>(null);
  const [editName, setEditName] = useState("");
  const [editTagline, setEditTagline] = useState("");
  const [editLinkedin, setEditLinkedin] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMessage, setProfileMessage] = useState("");
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [enrichPreview, setEnrichPreview] = useState<{
    name: string | null;
    tagline: string | null;
    profilePictureUrl: string | null;
  } | null>(null);

  // Voice state
  const [voice, setVoice] = useState<VoiceProfile>({
    voice_description: "",
    writing_samples: "",
    banned_vocabulary: "",
    signature_devices: "",
    emotional_register: "",
    source: "manual",
  });
  const [savingVoice, setSavingVoice] = useState(false);
  const [voiceMessage, setVoiceMessage] = useState("");
  const [scanning, setScanning] = useState(false);
  const [scanPosts, setScanPosts] = useState("");
  const [scanLinkedinUrl, setScanLinkedinUrl] = useState("");
  const [scanMode, setScanMode] = useState<"url" | "paste" | "upload">("url");
  const docInputRef = useRef<HTMLInputElement>(null);
  const [uploadedDocName, setUploadedDocName] = useState("");

  // Social accounts state
  const [accounts, setAccounts] = useState<SocialAccount[]>([]);
  const [showSocialForm, setShowSocialForm] = useState(false);
  const [showBlueskyForm, setShowBlueskyForm] = useState(false);
  const [blueskyHandle, setBlueskyHandle] = useState("");
  const [blueskyAppPassword, setBlueskyAppPassword] = useState("");
  const [savingBluesky, setSavingBluesky] = useState(false);
  const [formPlatform, setFormPlatform] = useState<SocialPlatform | "">("");
  const [formAccountName, setFormAccountName] = useState("");
  const [formAccountId, setFormAccountId] = useState("");
  const [savingSocial, setSavingSocial] = useState(false);

  // Active section for mobile/compact view
  const [activeSection, setActiveSection] = useState<"profile" | "voice" | "social">("profile");

  // ============================================================
  // Data loading
  // ============================================================

  const loadPerson = useCallback(async () => {
    const res = await fetch(`/api/config/spokespersons?companyId=${companyId}`);
    const data = await res.json();
    const found = (data.data || []).find((p: Spokesperson) => p.id === personId);
    if (found) {
      setPerson(found);
      setEditName(found.name);
      setEditTagline(found.tagline || "");
      setEditLinkedin(found.linkedin_url || "");
      setScanLinkedinUrl(found.linkedin_url || "");
    }
  }, [companyId, personId]);

  const loadVoice = useCallback(async () => {
    const res = await fetch(`/api/config/voice?companyId=${companyId}&spokespersonId=${personId}`);
    const data = await res.json();
    if (data.data) setVoice(data.data);
  }, [companyId, personId]);

  const loadSocial = useCallback(async () => {
    const res = await fetch(`/api/config/social-accounts?companyId=${companyId}&spokespersonId=${personId}`);
    const data = await res.json();
    setAccounts(data.data || []);
  }, [companyId, personId]);

  useEffect(() => {
    loadPerson();
    loadVoice();
    loadSocial();
  }, [loadPerson, loadVoice, loadSocial]);

  // ============================================================
  // Profile handlers
  // ============================================================

  const [enriching, setEnriching] = useState(false);

  const handleSaveProfile = async () => {
    setSavingProfile(true);
    setProfileMessage("");
    try {
      const res = await fetch("/api/config/spokespersons", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: personId,
          name: editName,
          tagline: editTagline || null,
          linkedinUrl: editLinkedin || null,
        }),
      });
      if (!res.ok) throw new Error("Save failed");
      setProfileMessage("Profile saved");
      setEnrichPreview(null);
      await loadPerson();
    } catch {
      setProfileMessage("Error saving profile");
    } finally {
      setSavingProfile(false);
    }
  };

  // Enrich from LinkedIn — fetch and PREVIEW before saving
  const handleEnrichFromLinkedIn = async () => {
    if (!editLinkedin) return;
    setEnriching(true);
    setProfileMessage("");
    setEnrichPreview(null);
    try {
      const res = await fetch("/api/config/spokespersons/enrich", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ linkedinUrl: editLinkedin }),
      });
      if (!res.ok) {
        const err = await res.json();
        setProfileMessage(err.error || "Enrichment failed");
        return;
      }
      const data = await res.json();
      setEnrichPreview(data);
      setProfileMessage("");
    } catch {
      setProfileMessage("Failed to reach LinkedIn enrichment service");
    } finally {
      setEnriching(false);
    }
  };

  // Apply enriched data to the form fields
  const handleApplyEnrichment = () => {
    if (!enrichPreview) return;
    if (enrichPreview.name && !editName) setEditName(enrichPreview.name);
    if (enrichPreview.tagline) setEditTagline(enrichPreview.tagline);
    setProfileMessage("LinkedIn data applied. Review and Save Profile.");
    setEnrichPreview(null);
  };

  const handleUploadPhoto = async (file: File) => {
    setUploadingPhoto(true);
    const formData = new FormData();
    formData.append("file", file);
    formData.append("companyId", companyId);
    formData.append("type", "profile_picture");
    try {
      const res = await fetch("/api/upload/logo", { method: "POST", body: formData });
      const data = await res.json();
      if (res.ok && data.url) {
        await fetch("/api/config/spokespersons", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: personId, profilePictureUrl: data.url }),
        });
        loadPerson();
      }
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleSetPrimary = async () => {
    await fetch("/api/config/spokespersons", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: personId, isPrimary: true }),
    });
    loadPerson();
  };

  // ============================================================
  // Voice handlers
  // ============================================================

  const handleSaveVoice = async () => {
    setSavingVoice(true);
    setVoiceMessage("");
    try {
      const res = await fetch("/api/config/voice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId,
          spokespersonId: personId,
          voice_description: voice.voice_description,
          writing_samples: voice.writing_samples,
          banned_vocabulary: voice.banned_vocabulary,
          signature_devices: voice.signature_devices,
          emotional_register: voice.emotional_register,
          source: voice.source,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");
      setVoiceMessage("Voice profile saved");
    } catch (err) {
      setVoiceMessage(`Error: ${err instanceof Error ? err.message : "unknown"}`);
    } finally {
      setSavingVoice(false);
    }
  };

  const handleScanVoice = async () => {
    const hasInput = scanMode === "url" ? scanLinkedinUrl.trim() : scanPosts.trim();
    if (!hasInput) return;
    setScanning(true);
    setVoiceMessage("");
    try {
      const requestBody = scanMode === "url"
        ? { companyId, linkedinUrl: scanLinkedinUrl.trim() }
        : { companyId, posts: scanPosts, isDocument: scanMode === "upload" };

      const res = await fetch("/api/setup/scan-linkedin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });
      const data = await res.json();

      if (data.needsManualPaste) {
        setScanMode("paste");
        setVoiceMessage("Could not retrieve posts from that URL. Paste posts manually below.");
        setScanning(false);
        return;
      }

      if (!res.ok) throw new Error(data.error || "Scan failed");
      if (data.profile) {
        setVoice({
          ...voice,
          ...data.profile,
          source: scanMode === "upload" ? "document_upload" : "linkedin_scan",
        });
        if (data.ai_voice_detected) {
          setVoiceMessage(
            `⚠️ AI-generated writing patterns detected. ${data.ai_voice_notes || "The voice profile below has been adjusted to capture the authentic voice underneath."} Review and edit below.`
          );
        } else {
          setVoiceMessage("Voice profile extracted. Review and save below.");
        }
      }
    } catch (err) {
      setVoiceMessage(err instanceof Error ? err.message : "Scan failed");
    } finally {
      setScanning(false);
    }
  };

  // ============================================================
  // Social handlers
  // ============================================================

  const handleAddSocial = async () => {
    if (!formPlatform) return;
    setSavingSocial(true);
    try {
      const res = await fetch("/api/config/social-accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId,
          platform: formPlatform,
          accountName: formAccountName || null,
          accountId: formAccountId || null,
          spokespersonId: personId,
        }),
      });
      if (res.ok) {
        setShowSocialForm(false);
        setFormPlatform("");
        setFormAccountName("");
        setFormAccountId("");
        loadSocial();
      }
    } finally {
      setSavingSocial(false);
    }
  };

  const handleDeleteSocial = async (id: string) => {
    await fetch("/api/config/social-accounts", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    loadSocial();
  };

  const handleConnectBluesky = async () => {
    if (!blueskyHandle || !blueskyAppPassword) return;
    setSavingBluesky(true);
    try {
      const res = await fetch("/api/auth/bluesky", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId,
          spokespersonId: personId,
          handle: blueskyHandle,
          appPassword: blueskyAppPassword,
        }),
      });
      if (res.ok) {
        setShowBlueskyForm(false);
        setBlueskyHandle("");
        setBlueskyAppPassword("");
        loadSocial();
      }
    } finally {
      setSavingBluesky(false);
    }
  };

  // ============================================================
  // Render
  // ============================================================

  if (!person) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-200 border-t-sky-600" />
      </div>
    );
  }

  const initials = person.name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);

  return (
    <div className="space-y-6">
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleUploadPhoto(file);
        }}
      />

      {/* Back link + header */}
      <div className="flex items-center gap-3">
        <Link
          href={`/setup/${companyId}/people`}
          className="rounded-md border border-gray-200 p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-semibold text-gray-900 truncate">{person.name}</h2>
          <p className="text-xs text-gray-500">{person.tagline || "No tagline"}</p>
        </div>
        {!person.is_primary && (
          <button
            onClick={handleSetPrimary}
            className="rounded-md border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
          >
            Set as Primary
          </button>
        )}
        {person.is_primary && (
          <span className="rounded-full bg-sky-100 px-2.5 py-1 text-[10px] font-semibold text-sky-700">
            Primary Spokesperson
          </span>
        )}
      </div>

      {/* Section tabs */}
      <div className="flex gap-1 rounded-lg bg-gray-100 p-1">
        {(["profile", "voice", "social"] as const).map((section) => (
          <button
            key={section}
            onClick={() => setActiveSection(section)}
            className={`flex-1 rounded-md px-3 py-2 text-xs font-medium transition-colors ${
              activeSection === section
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {section === "profile" ? "Profile" : section === "voice" ? "Voice Profile" : "Social Accounts"}
          </button>
        ))}
      </div>

      {/* ============================================================ */}
      {/* PROFILE SECTION */}
      {/* ============================================================ */}
      {activeSection === "profile" && (
        <div className="rounded-xl border border-gray-200 bg-white p-6 space-y-6">
          {/* Photo */}
          <div className="flex items-center gap-4">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="group relative h-20 w-20 shrink-0 overflow-hidden rounded-full border-2 border-gray-200"
            >
              {person.profile_picture_url ? (
                <img src={person.profile_picture_url} alt={person.name} className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-gray-100 text-xl font-bold text-gray-400">
                  {initials}
                </div>
              )}
              <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100 rounded-full">
                <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
              {uploadingPhoto && (
                <div className="absolute inset-0 flex items-center justify-center bg-white/80 rounded-full">
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-sky-200 border-t-sky-600" />
                </div>
              )}
            </button>
            <div>
              <p className="text-sm font-medium text-gray-900">Profile Photo</p>
              <p className="text-xs text-gray-500">Click to upload. Used in image overlays and content attribution.</p>
            </div>
          </div>

          {/* Editable fields */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Full Name</label>
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Tagline</label>
              <input
                type="text"
                value={editTagline}
                onChange={(e) => setEditTagline(e.target.value)}
                placeholder="e.g. Founder & CEO"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">LinkedIn URL</label>
            <div className="flex gap-2">
              <input
                type="url"
                value={editLinkedin}
                onChange={(e) => { setEditLinkedin(e.target.value); setEnrichPreview(null); }}
                placeholder="https://linkedin.com/in/username"
                className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none"
              />
              <button
                onClick={handleEnrichFromLinkedIn}
                disabled={enriching || !editLinkedin}
                className="flex-shrink-0 inline-flex items-center gap-1.5 rounded-md border border-sky-300 bg-sky-50 px-4 py-2 text-xs font-medium text-sky-700 hover:bg-sky-100 disabled:opacity-50 transition-colors"
              >
                {enriching ? (
                  <>
                    <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Fetching...
                  </>
                ) : (
                  <>
                    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9" />
                    </svg>
                    Enrich from LinkedIn
                  </>
                )}
              </button>
            </div>
          </div>

          {/* LinkedIn Enrichment Preview */}
          {enrichPreview && (
            <div className="rounded-lg border border-sky-200 bg-sky-50 p-4">
              <div className="flex items-center gap-2 mb-3">
                <svg className="h-4 w-4 text-sky-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M9 12l2 2 4-4" />
                  <circle cx="12" cy="12" r="10" />
                </svg>
                <p className="text-sm font-semibold text-sky-800">Found on LinkedIn</p>
              </div>
              <div className="flex items-start gap-4">
                {enrichPreview.profilePictureUrl && (
                  <img
                    src={enrichPreview.profilePictureUrl}
                    alt="LinkedIn photo"
                    className="h-16 w-16 rounded-full object-cover border-2 border-white shadow-sm"
                  />
                )}
                <div className="flex-1 min-w-0 space-y-1">
                  {enrichPreview.name && (
                    <div>
                      <span className="text-[10px] font-medium uppercase tracking-wider text-sky-500">Name</span>
                      <p className="text-sm font-semibold text-gray-900">{enrichPreview.name}</p>
                    </div>
                  )}
                  {enrichPreview.tagline && (
                    <div>
                      <span className="text-[10px] font-medium uppercase tracking-wider text-sky-500">Tagline</span>
                      <p className="text-sm text-gray-700">{enrichPreview.tagline}</p>
                    </div>
                  )}
                  {enrichPreview.profilePictureUrl && (
                    <div>
                      <span className="text-[10px] font-medium uppercase tracking-wider text-sky-500">Photo</span>
                      <p className="text-sm text-gray-700">Profile photo found</p>
                    </div>
                  )}
                </div>
              </div>
              <div className="mt-3 flex gap-2">
                <button
                  onClick={handleApplyEnrichment}
                  className="rounded-md bg-sky-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-sky-700 transition-colors"
                >
                  Apply to Profile
                </button>
                <button
                  onClick={() => setEnrichPreview(null)}
                  className="rounded-md border border-gray-300 px-4 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  Dismiss
                </button>
              </div>
            </div>
          )}

          {profileMessage && (
            <p className={`text-sm ${profileMessage.includes("Error") || profileMessage.includes("Failed") ? "text-red-600" : "text-green-600"}`}>
              {profileMessage}
            </p>
          )}

          <button
            onClick={handleSaveProfile}
            disabled={savingProfile || enriching || !editName}
            className="rounded-md bg-gray-900 px-6 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
          >
            {savingProfile ? "Saving..." : "Save Profile"}
          </button>
        </div>
      )}

      {/* ============================================================ */}
      {/* VOICE SECTION */}
      {/* ============================================================ */}
      {activeSection === "voice" && (
        <div className="space-y-6">
          {/* Voice Scanner */}
          <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-sm font-semibold text-blue-900">Scan {person.name}&apos;s Voice</h3>
                <p className="mt-1 text-xs text-blue-700">
                  Analyse their writing or speaking samples to extract voice patterns.
                </p>
              </div>
              <div className="flex gap-0.5 rounded-md bg-blue-100 p-0.5">
                {(["url", "paste", "upload"] as const).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => setScanMode(mode)}
                    className={`rounded px-2 py-1 text-[10px] font-medium transition-colors ${
                      scanMode === mode ? "bg-white text-blue-700 shadow-sm" : "text-blue-500"
                    }`}
                  >
                    {mode === "url" ? "LinkedIn" : mode === "paste" ? "Paste Posts" : "Upload Doc"}
                  </button>
                ))}
              </div>
            </div>

            {scanMode === "url" ? (
              <div className="mt-3">
                <input
                  type="url"
                  value={scanLinkedinUrl}
                  onChange={(e) => setScanLinkedinUrl(e.target.value)}
                  placeholder="https://linkedin.com/in/username"
                  className="block w-full rounded-md border border-blue-200 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                />
              </div>
            ) : scanMode === "paste" ? (
              <textarea
                value={scanPosts}
                onChange={(e) => setScanPosts(e.target.value)}
                rows={6}
                placeholder="Paste 5-10 LinkedIn posts here (separate with --- between posts)"
                className="mt-3 block w-full rounded-md border border-blue-200 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              />
            ) : (
              <div className="mt-3">
                <input
                  ref={docInputRef}
                  type="file"
                  accept=".pdf,.docx,.doc,.txt,.md"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      setUploadedDocName(file.name);
                      // Read the file and extract text for analysis
                      const reader = new FileReader();
                      reader.onload = (ev) => {
                        const text = ev.target?.result as string;
                        setScanPosts(text);
                      };
                      reader.readAsText(file);
                    }
                  }}
                />
                <button
                  onClick={() => docInputRef.current?.click()}
                  className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-blue-200 bg-white px-4 py-6 text-sm text-blue-600 hover:border-blue-400 hover:bg-blue-50/50 transition-colors"
                >
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <span>{uploadedDocName || "Upload document (PDF, DOCX, TXT, MD)"}</span>
                </button>
                {uploadedDocName && (
                  <p className="mt-2 text-xs text-blue-600">
                    Loaded: {uploadedDocName} ({Math.round(scanPosts.length / 1000)}k characters)
                  </p>
                )}
                <p className="mt-2 text-[10px] text-blue-400">
                  Upload brand guidelines, content strategy docs, previous blog posts, email newsletters,
                  or any writing samples. The more content, the more accurate the voice profile.
                </p>
              </div>
            )}

            {voiceMessage && (
              <div className={`mt-2 rounded-md p-2 text-xs ${
                voiceMessage.includes("Error") || voiceMessage.includes("failed") || voiceMessage.includes("Could not")
                  ? "bg-red-50 text-red-700 border border-red-200"
                  : "bg-green-50 text-green-700 border border-green-200"
              }`}>
                {voiceMessage}
              </div>
            )}

            <button
              onClick={handleScanVoice}
              disabled={scanning || (scanMode === "url" ? !scanLinkedinUrl.trim() : !scanPosts.trim())}
              className="mt-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {scanning ? "Analysing..." : scanMode === "upload" ? "Analyse Document" : "Analyse Voice"}
            </button>
          </div>

          {/* Structured Voice Profile */}
          <div className="rounded-xl border border-gray-200 bg-white p-6">
            <h3 className="text-sm font-semibold text-gray-900 mb-4">{person.name}&apos;s Voice Profile</h3>
            <StructuredVoiceForm
              initial={voice.structured_voice || null}
              personName={person.name}
              onSave={async (structuredVoice) => {
                setSavingVoice(true);
                setVoiceMessage("");
                try {
                  const res = await fetch("/api/config/voice", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      companyId,
                      spokespersonId: personId,
                      // Keep legacy fields populated for backward compatibility
                      voice_description: structuredVoice.voice_character || voice.voice_description,
                      writing_samples: structuredVoice.writing_samples.map((s) => s.text).join("\n\n---\n\n") || voice.writing_samples,
                      banned_vocabulary: structuredVoice.banned_words.flatMap((c) => c.words).join(", ") || voice.banned_vocabulary,
                      signature_devices: [
                        ...(structuredVoice.signature_devices.bracketed_asides ? ["Bracketed asides"] : []),
                        ...(structuredVoice.signature_devices.question_tags ? ["Question tags"] : []),
                        ...(structuredVoice.signature_devices.british_interjections ? ["British interjections"] : []),
                        ...(structuredVoice.signature_devices.understatement ? ["Understatement"] : []),
                        ...structuredVoice.signature_devices.other,
                      ].join(", ") || voice.signature_devices,
                      emotional_register: voice.emotional_register,
                      structured_voice: structuredVoice,
                      source: "structured",
                    }),
                  });
                  const data = await res.json();
                  if (!res.ok) throw new Error(data.error || "Save failed");
                  setVoice((prev) => ({ ...prev, structured_voice: structuredVoice }));
                  setVoiceMessage("Voice profile saved");
                } catch (err) {
                  setVoiceMessage(`Error: ${err instanceof Error ? err.message : "unknown"}`);
                } finally {
                  setSavingVoice(false);
                }
              }}
              saving={savingVoice}
            />
            {voiceMessage && !voiceMessage.includes("⚠️") && (
              <p className={`mt-3 text-sm ${voiceMessage.includes("Error") ? "text-red-600" : "text-green-600"}`}>
                {voiceMessage}
              </p>
            )}
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* SOCIAL ACCOUNTS SECTION */}
      {/* ============================================================ */}
      {activeSection === "social" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-gray-900">{person.name}&apos;s Social Accounts</h3>
              <p className="text-xs text-gray-500">
                Personal social accounts for this person. Company pages are managed in{" "}
                <Link href={`/setup/${companyId}/social`} className="text-sky-600 hover:underline">
                  Company Social
                </Link>
                .
              </p>
            </div>
            <button
              onClick={() => setShowSocialForm(!showSocialForm)}
              className="rounded-md bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-700"
            >
              + Add Account
            </button>
          </div>

          {/* LinkedIn Direct Publishing Connection */}
          <div className="rounded-lg border border-blue-200 bg-blue-50/30 p-4">
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg" style={{ backgroundColor: "#0A66C215" }}>
                  <span className="text-sm font-bold" style={{ color: "#0A66C2" }}>in</span>
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-gray-900">LinkedIn Direct Publishing</h4>
                  <p className="mt-0.5 text-xs text-gray-500">
                    Connect to post directly from Quick Generate and the Publish page.
                  </p>
                  {accounts.some((a) => a.platform === "linkedin_personal" && a.has_tokens) ? (
                    <p className="mt-1 text-xs text-green-700">
                      Connected — {accounts.find((a) => a.platform === "linkedin_personal")?.account_name || "LinkedIn User"}
                    </p>
                  ) : null}
                </div>
              </div>
              <a
                href={`/api/auth/linkedin?companyId=${companyId}&returnTo=setup`}
                className="shrink-0 rounded-md px-3 py-1.5 text-xs font-medium text-white"
                style={{ backgroundColor: "#0A66C2" }}
              >
                {accounts.some((a) => a.platform === "linkedin_personal" && a.has_tokens) ? "Reconnect" : "Connect LinkedIn"}
              </a>
            </div>
          </div>

          {/* Bluesky Connection */}
          <div className="rounded-lg border border-sky-200 bg-sky-50/30 p-4">
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-sky-100">
                  <span className="text-sm font-bold text-sky-600">BS</span>
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-gray-900">Bluesky</h4>
                  <p className="mt-0.5 text-xs text-gray-500">
                    Connect with your Bluesky handle and an app password.{" "}
                    <a href="https://bsky.app/settings/app-passwords" target="_blank" rel="noopener" className="text-sky-600 hover:underline">
                      Create app password →
                    </a>
                  </p>
                  {accounts.some((a) => a.platform === "bluesky" && a.has_tokens) ? (
                    <p className="mt-1 text-xs text-green-700">
                      Connected — @{accounts.find((a) => a.platform === "bluesky")?.account_name || "handle"}
                    </p>
                  ) : null}
                </div>
              </div>
              {!showBlueskyForm ? (
                <button
                  onClick={() => setShowBlueskyForm(true)}
                  className="shrink-0 rounded-md bg-sky-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-600"
                >
                  {accounts.some((a) => a.platform === "bluesky" && a.has_tokens) ? "Reconnect" : "Connect Bluesky"}
                </button>
              ) : null}
            </div>
            {showBlueskyForm && (
              <div className="mt-3 space-y-2">
                <div className="grid gap-2 sm:grid-cols-2">
                  <input
                    type="text"
                    value={blueskyHandle}
                    onChange={(e) => setBlueskyHandle(e.target.value)}
                    placeholder="yourhandle.bsky.social"
                    className="rounded-md border border-sky-200 bg-white px-3 py-1.5 text-sm focus:border-sky-500 focus:outline-none"
                  />
                  <input
                    type="password"
                    value={blueskyAppPassword}
                    onChange={(e) => setBlueskyAppPassword(e.target.value)}
                    placeholder="App password"
                    className="rounded-md border border-sky-200 bg-white px-3 py-1.5 text-sm focus:border-sky-500 focus:outline-none"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleConnectBluesky}
                    disabled={savingBluesky || !blueskyHandle || !blueskyAppPassword}
                    className="rounded-md bg-sky-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-600 disabled:opacity-50"
                  >
                    {savingBluesky ? "Connecting..." : "Connect"}
                  </button>
                  <button
                    onClick={() => setShowBlueskyForm(false)}
                    className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>

          {showSocialForm && (
            <div className="rounded-lg border border-gray-200 bg-white p-4 space-y-4">
              <h4 className="text-sm font-semibold text-gray-900">Add Personal Account</h4>
              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700">Platform</label>
                  <select
                    value={formPlatform}
                    onChange={(e) => setFormPlatform(e.target.value as SocialPlatform)}
                    className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm"
                  >
                    <option value="">Select...</option>
                    {PERSONAL_PLATFORMS.map((p) => (
                      <option key={p.value} value={p.value}>{p.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700">Account Name</label>
                  <input
                    type="text"
                    value={formAccountName}
                    onChange={(e) => setFormAccountName(e.target.value)}
                    placeholder="e.g. @michaelct"
                    className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700">Account ID</label>
                  <input
                    type="text"
                    value={formAccountId}
                    onChange={(e) => setFormAccountId(e.target.value)}
                    placeholder="Platform-specific ID"
                    className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm"
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleAddSocial}
                  disabled={savingSocial || !formPlatform}
                  className="rounded-md bg-sky-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-700 disabled:opacity-50"
                >
                  {savingSocial ? "Saving..." : "Save Account"}
                </button>
                <button
                  onClick={() => setShowSocialForm(false)}
                  className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Connected personal accounts */}
          <div className="grid gap-3 sm:grid-cols-2">
            {PERSONAL_PLATFORMS.map((platform) => {
              const connected = accounts.filter((a) => a.platform === platform.value);
              return (
                <div
                  key={platform.value}
                  className={`rounded-lg border p-4 ${
                    connected.length > 0
                      ? "border-green-200 bg-green-50/30"
                      : "border-gray-200 bg-white"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-md bg-gray-100 text-xs font-bold text-gray-600">
                      {platform.icon}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-900">{platform.label}</p>
                      {connected.length > 0 ? (
                        connected.map((acc) => (
                          <div key={acc.id} className="mt-1 flex items-center justify-between">
                            <span className="text-xs text-gray-600">
                              {acc.account_name || acc.account_id || "Connected"}
                            </span>
                            <button
                              onClick={() => handleDeleteSocial(acc.id)}
                              className="text-xs text-red-500 hover:text-red-700"
                            >
                              Remove
                            </button>
                          </div>
                        ))
                      ) : (
                        <p className="mt-1 text-xs text-gray-400">Not connected</p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
