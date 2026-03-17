"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";

interface VoiceProfile {
  id?: string;
  voice_description: string;
  writing_samples: string;
  banned_vocabulary: string;
  signature_devices: string;
  emotional_register: string;
  source: string;
}

export default function VoiceProfilePage() {
  const { companyId } = useParams<{ companyId: string }>();
  const [profile, setProfile] = useState<VoiceProfile>({
    voice_description: "",
    writing_samples: "",
    banned_vocabulary: "",
    signature_devices: "",
    emotional_register: "",
    source: "manual",
  });
  const [saving, setSaving] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanPosts, setScanPosts] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    fetch(`/api/config/voice?companyId=${companyId}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.data) setProfile(d.data);
      });
  }, [companyId]);

  const handleSave = async () => {
    setSaving(true);
    setMessage("");
    try {
      const res = await fetch("/api/config/voice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId, ...profile }),
      });
      if (!res.ok) throw new Error("Save failed");
      setMessage("Voice profile saved");
    } catch {
      setMessage("Error saving");
    } finally {
      setSaving(false);
    }
  };

  const handleScanLinkedIn = async () => {
    if (!scanPosts.trim()) return;
    setScanning(true);
    setMessage("");
    try {
      const res = await fetch("/api/setup/scan-linkedin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId, posts: scanPosts }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Scan failed");
      if (data.profile) {
        setProfile({
          ...profile,
          ...data.profile,
          source: "linkedin_scan",
        });
        setMessage("Voice profile extracted from LinkedIn posts. Review and save.");
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Scan failed");
    } finally {
      setScanning(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Voice Profile</h2>
        <p className="mt-1 text-sm text-gray-500">
          Define how content should sound. Enter manually or scan LinkedIn posts to extract voice patterns.
        </p>
      </div>

      {/* LinkedIn Scanner */}
      <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
        <h3 className="text-sm font-semibold text-blue-900">Scan LinkedIn Posts</h3>
        <p className="mt-1 text-xs text-blue-700">
          Paste 5-10 recent LinkedIn posts below and we&apos;ll analyse the writing style to extract voice patterns.
        </p>
        <textarea
          value={scanPosts}
          onChange={(e) => setScanPosts(e.target.value)}
          rows={6}
          placeholder="Paste LinkedIn posts here (separate with --- between posts)"
          className="mt-3 block w-full rounded-md border border-blue-200 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
        />
        <button
          onClick={handleScanLinkedIn}
          disabled={scanning || !scanPosts.trim()}
          className="mt-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {scanning ? "Analysing..." : "Analyse Voice"}
        </button>
      </div>

      {/* Manual fields */}
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700">Voice Description</label>
          <textarea
            value={profile.voice_description}
            onChange={(e) => setProfile({ ...profile, voice_description: e.target.value })}
            rows={4}
            placeholder="How this person writes: confident, direct, uses short sentences..."
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">Writing Samples</label>
          <textarea
            value={profile.writing_samples}
            onChange={(e) => setProfile({ ...profile, writing_samples: e.target.value })}
            rows={4}
            placeholder="2-3 representative paragraphs that show their natural writing style"
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">Signature Devices</label>
          <textarea
            value={profile.signature_devices}
            onChange={(e) => setProfile({ ...profile, signature_devices: e.target.value })}
            rows={3}
            placeholder="Recurring phrases, structural patterns, rhetorical habits"
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">Banned Vocabulary</label>
          <textarea
            value={profile.banned_vocabulary}
            onChange={(e) => setProfile({ ...profile, banned_vocabulary: e.target.value })}
            rows={2}
            placeholder="Words and phrases they NEVER use (one per line)"
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">Emotional Register</label>
          <textarea
            value={profile.emotional_register}
            onChange={(e) => setProfile({ ...profile, emotional_register: e.target.value })}
            rows={2}
            placeholder="Understated/enthusiastic, first-person/third-person tendencies"
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none"
          />
        </div>
      </div>

      {message && (
        <p className={`text-sm ${message.includes("Error") ? "text-red-600" : "text-green-600"}`}>
          {message}
        </p>
      )}

      <button
        onClick={handleSave}
        disabled={saving}
        className="rounded-md bg-gray-900 px-6 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
      >
        {saving ? "Saving..." : "Save Voice Profile"}
      </button>
    </div>
  );
}
