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
  const [linkedinUrl, setLinkedinUrl] = useState("");
  const [scanMode, setScanMode] = useState<"url" | "paste">("url");
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
        body: JSON.stringify({
          companyId,
          voice_description: profile.voice_description,
          writing_samples: profile.writing_samples,
          banned_vocabulary: profile.banned_vocabulary,
          signature_devices: profile.signature_devices,
          emotional_register: profile.emotional_register,
          source: profile.source,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");
      setMessage("Voice profile saved");
    } catch (err) {
      setMessage(`Error saving: ${err instanceof Error ? err.message : "unknown"}`);
    } finally {
      setSaving(false);
    }
  };

  const handleScanLinkedIn = async () => {
    const hasInput = scanMode === "url" ? linkedinUrl.trim() : scanPosts.trim();
    if (!hasInput) return;
    setScanning(true);
    setMessage("");
    try {
      const requestBody = scanMode === "url"
        ? { companyId, linkedinUrl: linkedinUrl.trim() }
        : { companyId, posts: scanPosts };

      const res = await fetch("/api/setup/scan-linkedin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });
      const data = await res.json();

      // If URL mode failed and needs manual paste, switch to paste mode
      if (data.needsManualPaste) {
        setScanMode("paste");
        setMessage("Could not retrieve posts from that URL. Paste posts manually below.");
        setScanning(false);
        return;
      }

      if (!res.ok) throw new Error(data.error || "Scan failed");
      if (data.profile) {
        setProfile({
          ...profile,
          ...data.profile,
          source: "linkedin_scan",
        });
        setMessage("Voice profile extracted. Review the results below and save.");
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

      {/* Voice Scanner — Multiple Sources */}
      <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-sm font-semibold text-blue-900">Scan Voice</h3>
            <p className="mt-1 text-xs text-blue-700">
              Analyse writing or speaking samples to extract voice patterns automatically.
            </p>
          </div>
          {/* Source toggle */}
          <div className="flex gap-0.5 rounded-md bg-blue-100 p-0.5">
            {(["url", "paste", "blog", "video", "pdf"] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setScanMode(mode as "url" | "paste")}
                className={`rounded px-2 py-1 text-[10px] font-medium transition-colors ${
                  scanMode === mode ? "bg-white text-blue-700 shadow-sm" : "text-blue-500"
                }`}
              >
                {mode === "url" ? "LinkedIn" : mode === "paste" ? "Paste" : mode === "blog" ? "Blog" : mode === "video" ? "Video" : "PDF"}
              </button>
            ))}
          </div>
        </div>

        {scanMode === "url" ? (
          <div className="mt-3">
            <input
              type="url"
              value={linkedinUrl}
              onChange={(e) => setLinkedinUrl(e.target.value)}
              placeholder="https://linkedin.com/in/username"
              className="block w-full rounded-md border border-blue-200 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            />
            <p className="mt-1 text-[10px] text-blue-400">
              We&apos;ll analyse their LinkedIn activity to extract voice patterns.
            </p>
          </div>
        ) : (
          <textarea
            value={scanPosts}
            onChange={(e) => setScanPosts(e.target.value)}
            rows={6}
            placeholder="Paste 5-10 LinkedIn posts here (separate with --- between posts)"
            className="mt-3 block w-full rounded-md border border-blue-200 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          />
        )}

        {scanMode === ("blog" as string) && (
          <div className="mt-3">
            <input
              type="url"
              value={linkedinUrl}
              onChange={(e) => setLinkedinUrl(e.target.value)}
              placeholder="https://example.com/blog/article-title"
              className="block w-full rounded-md border border-blue-200 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            />
            <p className="mt-1 text-[10px] text-blue-400">
              Paste a blog URL and we&apos;ll extract the text and analyse the writing style.
            </p>
          </div>
        )}

        {scanMode === ("video" as string) && (
          <div className="mt-3">
            <input
              type="url"
              value={linkedinUrl}
              onChange={(e) => setLinkedinUrl(e.target.value)}
              placeholder="https://youtube.com/watch?v=... or podcast URL"
              className="block w-full rounded-md border border-blue-200 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            />
            <p className="mt-1 text-[10px] text-blue-400">
              Paste a video or podcast URL. We&apos;ll transcribe it and analyse their speaking style.
            </p>
          </div>
        )}

        {scanMode === ("pdf" as string) && (
          <div className="mt-3">
            <textarea
              value={scanPosts}
              onChange={(e) => setScanPosts(e.target.value)}
              rows={6}
              placeholder="Paste the text content from a PDF, whitepaper, or document. Copy and paste the text here."
              className="block w-full rounded-md border border-blue-200 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            />
            <p className="mt-1 text-[10px] text-blue-400">
              Paste text from a PDF, whitepaper, case study, or any document they&apos;ve written.
              The more text, the better the voice analysis.
            </p>
          </div>
        )}

        {/* Error display — prominent */}
        {message && (
          <div className={`mt-2 rounded-md p-2 text-xs ${
            message.includes("Error") || message.includes("failed") || message.includes("Could not")
              ? "bg-red-50 text-red-700 border border-red-200"
              : "bg-green-50 text-green-700 border border-green-200"
          }`}>
            {message}
          </div>
        )}

        <button
          onClick={handleScanLinkedIn}
          disabled={scanning || (!linkedinUrl.trim() && !scanPosts.trim())}
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
