"use client";

import { useState, useEffect, useRef } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

interface Spokesperson {
  id: string;
  name: string;
  tagline: string | null;
  profile_picture_url: string | null;
  linkedin_url: string | null;
  is_primary: boolean;
}

interface NewPerson {
  name: string;
  tagline: string;
  linkedinUrl: string;
  profilePictureUrl: string;
}

const EMPTY_PERSON: NewPerson = { name: "", tagline: "", linkedinUrl: "", profilePictureUrl: "" };

export default function PeoplePage() {
  const { companyId } = useParams<{ companyId: string }>();
  const [people, setPeople] = useState<Spokesperson[]>([]);
  const [adding, setAdding] = useState(false);
  const [newPerson, setNewPerson] = useState<NewPerson>(EMPTY_PERSON);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [uploadingFor, setUploadingFor] = useState<string | null>(null);
  const [enriching, setEnriching] = useState(false);
  const [enrichError, setEnrichError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch(`/api/config/spokespersons?companyId=${companyId}`)
      .then((r) => r.json())
      .then((d) => setPeople(d.data || []));
  }, [companyId]);

  const handleAdd = async () => {
    if (!newPerson.name) return;
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch("/api/config/spokespersons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId,
          name: newPerson.name,
          tagline: newPerson.tagline || null,
          linkedinUrl: newPerson.linkedinUrl || null,
          profilePictureUrl: newPerson.profilePictureUrl || null,
          isPrimary: people.length === 0,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setPeople([...people, data.data]);
        setNewPerson(EMPTY_PERSON);
        setAdding(false);
        setEnrichError(null);
      } else {
        setSaveError(
          data.error ||
            "Failed to save. The spokespersons table may not exist yet — run migration 009 in Supabase."
        );
      }
    } catch {
      setSaveError("Network error — please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleEnrich = async () => {
    if (!newPerson.linkedinUrl) return;
    setEnriching(true);
    setEnrichError(null);
    try {
      const res = await fetch("/api/config/spokespersons/enrich", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: newPerson.linkedinUrl }),
      });
      const data = await res.json();
      if (res.ok) {
        setNewPerson((prev) => ({
          ...prev,
          name: data.name || prev.name,
          tagline: data.tagline || prev.tagline,
          profilePictureUrl: data.profilePictureUrl || prev.profilePictureUrl,
        }));
      } else if (data.setupRequired) {
        setEnrichError("setup-required");
      } else {
        setEnrichError(data.error || "Could not fetch LinkedIn profile.");
      }
    } catch {
      setEnrichError("Network error — please try again.");
    } finally {
      setEnriching(false);
    }
  };

  const handleSetPrimary = async (id: string) => {
    await fetch("/api/config/spokespersons", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, isPrimary: true }),
    });
    setPeople(people.map((p) => ({ ...p, is_primary: p.id === id })));
  };

  const handleUploadPhoto = async (personId: string, file: File) => {
    setUploadingFor(personId);
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
        setPeople(people.map((p) => (p.id === personId ? { ...p, profile_picture_url: data.url } : p)));
      }
    } finally {
      setUploadingFor(null);
    }
  };

  const handleRemove = async (id: string) => {
    await fetch("/api/config/spokespersons", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    setPeople(people.filter((p) => p.id !== id));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">People</h2>
          <p className="mt-1 text-sm text-gray-500">
            Spokespersons who create content for this company. Click a person to manage their voice profile, social accounts, and details.
          </p>
        </div>
        <button
          onClick={() => { setAdding(true); setEnrichError(null); }}
          className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
        >
          Add Person
        </button>
      </div>

      {/* Hidden file input for photo uploads */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file && uploadingFor) handleUploadPhoto(uploadingFor, file);
        }}
      />

      {/* People list — each card is a link to their detail page */}
      <div className="space-y-3">
        {people.map((person) => (
          <div
            key={person.id}
            onClick={(e) => {
              // Navigate to profile if clicking the card background (not a button/link)
              const target = e.target as HTMLElement;
              if (!target.closest("button") && !target.closest("a") && !target.closest("input")) {
                window.location.href = `/setup/${companyId}/people/${person.id}`;
              }
            }}
            className={`rounded-xl border p-4 transition-colors cursor-pointer ${
              person.is_primary ? "border-sky-200 bg-sky-50/50" : "border-gray-200 bg-white"
            }`}
          >
            <div className="flex items-center gap-4">
              {/* Photo */}
              <button
                onClick={() => {
                  setUploadingFor(person.id);
                  fileInputRef.current?.click();
                }}
                className="group relative h-16 w-16 shrink-0 overflow-hidden rounded-full border-2 border-gray-200"
              >
                {person.profile_picture_url ? (
                  <img src={person.profile_picture_url} alt={person.name} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-gray-100 text-lg font-bold text-gray-400">
                    {person.name
                      .split(" ")
                      .map((n) => n[0])
                      .join("")
                      .toUpperCase()
                      .slice(0, 2)}
                  </div>
                )}
                <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100 rounded-full">
                  <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </div>
                {uploadingFor === person.id && (
                  <div className="absolute inset-0 flex items-center justify-center bg-white/80 rounded-full">
                    <div className="h-5 w-5 animate-spin rounded-full border-2 border-sky-200 border-t-sky-600" />
                  </div>
                )}
              </button>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <Link
                    href={`/setup/${companyId}/people/${person.id}`}
                    className="text-sm font-semibold text-gray-900 hover:text-sky-600 transition-colors"
                  >
                    {person.name}
                  </Link>
                  {person.is_primary && (
                    <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-semibold text-sky-700">
                      Primary
                    </span>
                  )}
                </div>
                {person.tagline && <p className="text-xs text-gray-500">{person.tagline}</p>}
                {person.linkedin_url && (
                  <a
                    href={person.linkedin_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[10px] text-sky-600 hover:underline"
                  >
                    LinkedIn Profile
                  </a>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2">
                <Link
                  href={`/setup/${companyId}/people/${person.id}`}
                  className="rounded-md border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-medium text-sky-700 hover:bg-sky-100 transition-colors"
                >
                  Edit Profile
                </Link>
                {!person.is_primary && (
                  <button
                    onClick={() => handleSetPrimary(person.id)}
                    className="rounded-md border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
                  >
                    Set Primary
                  </button>
                )}
                <button onClick={() => handleRemove(person.id)} className="text-xs text-red-400 hover:text-red-600">
                  Remove
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {people.length === 0 && !adding && (
        <div className="rounded-xl border border-dashed border-gray-300 p-12 text-center">
          <p className="text-gray-500">No people added yet. Add the first spokesperson.</p>
        </div>
      )}

      {/* Add new person form */}
      {adding && (
        <div className="rounded-xl border border-sky-200 bg-sky-50 p-4 space-y-4">
          <h3 className="text-sm font-semibold text-gray-900">Add Person</h3>

          {/* LinkedIn URL row with Fetch button */}
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">LinkedIn URL</label>
            <div className="flex gap-2">
              <input
                type="url"
                value={newPerson.linkedinUrl}
                onChange={(e) => {
                  setNewPerson({ ...newPerson, linkedinUrl: e.target.value });
                  setEnrichError(null);
                }}
                placeholder="https://linkedin.com/in/username"
                className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none"
              />
              <button
                onClick={handleEnrich}
                disabled={!newPerson.linkedinUrl || enriching}
                className="flex items-center gap-1.5 rounded-md border border-sky-300 bg-white px-3 py-2 text-xs font-medium text-sky-700 hover:bg-sky-50 disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
              >
                {enriching ? (
                  <>
                    <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-sky-200 border-t-sky-600" />
                    Fetching…
                  </>
                ) : (
                  <>
                    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
                    </svg>
                    Import from LinkedIn
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Enrich error / setup message */}
          {enrichError === "setup-required" && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 space-y-1">
              <p className="font-medium">LinkedIn import needs a Proxycurl API key</p>
              <p>
                Add <code className="rounded bg-amber-100 px-1 font-mono">PROXYCURL_API_KEY</code> to your{" "}
                <code className="rounded bg-amber-100 px-1 font-mono">.env.local</code> file. Sign up at{" "}
                <a href="https://nubela.co/proxycurl" target="_blank" rel="noopener noreferrer" className="underline">
                  nubela.co/proxycurl
                </a>{" "}
                (~$0.01/lookup, 10 free credits to start).
              </p>
            </div>
          )}
          {enrichError && enrichError !== "setup-required" && (
            <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{enrichError}</p>
          )}

          {/* Name + tagline + optional photo preview */}
          <div className="flex gap-3">
            {newPerson.profilePictureUrl && (
              <div className="shrink-0">
                <img
                  src={newPerson.profilePictureUrl}
                  alt="Profile preview"
                  className="h-16 w-16 rounded-full border-2 border-sky-200 object-cover"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = "none";
                  }}
                />
              </div>
            )}
            <div className="flex-1 grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Full name</label>
                <input
                  type="text"
                  value={newPerson.name}
                  onChange={(e) => setNewPerson({ ...newPerson, name: e.target.value })}
                  placeholder="Full name"
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Tagline</label>
                <input
                  type="text"
                  value={newPerson.tagline}
                  onChange={(e) => setNewPerson({ ...newPerson, tagline: e.target.value })}
                  placeholder="e.g. Founder, CEO"
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none"
                />
              </div>
            </div>
          </div>

          {saveError && (
            <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{saveError}</p>
          )}

          <div className="flex gap-2">
            <button
              onClick={handleAdd}
              disabled={saving || !newPerson.name}
              className="rounded-md bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-50"
            >
              {saving ? "Adding…" : "Add"}
            </button>
            <button
              onClick={() => {
                setAdding(false);
                setSaveError(null);
                setEnrichError(null);
                setNewPerson(EMPTY_PERSON);
              }}
              className="rounded-md border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
