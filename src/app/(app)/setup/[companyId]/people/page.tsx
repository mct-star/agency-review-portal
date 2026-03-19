"use client";

import { useState, useEffect, useRef } from "react";
import { useParams } from "next/navigation";

interface Spokesperson {
  id: string;
  name: string;
  tagline: string | null;
  profile_picture_url: string | null;
  linkedin_url: string | null;
  is_primary: boolean;
}

export default function PeoplePage() {
  const { companyId } = useParams<{ companyId: string }>();
  const [people, setPeople] = useState<Spokesperson[]>([]);
  const [adding, setAdding] = useState(false);
  const [newPerson, setNewPerson] = useState({ name: "", tagline: "", linkedinUrl: "" });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [uploadingFor, setUploadingFor] = useState<string | null>(null);
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
          isPrimary: people.length === 0,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setPeople([...people, data.data]);
        setNewPerson({ name: "", tagline: "", linkedinUrl: "" });
        setAdding(false);
      } else {
        setSaveError(data.error || "Failed to save. The spokespersons table may not exist yet — run migration 009 in Supabase.");
      }
    } catch {
      setSaveError("Network error — please try again.");
    } finally {
      setSaving(false);
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
        // Update the spokesperson record with the photo URL
        await fetch("/api/config/spokespersons", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: personId, profilePictureUrl: data.url }),
        });
        setPeople(people.map((p) => p.id === personId ? { ...p, profile_picture_url: data.url } : p));
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
            Spokespersons who create content for this company. Each person has their own profile, photo, and voice.
          </p>
        </div>
        <button
          onClick={() => setAdding(true)}
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

      {/* People list */}
      <div className="space-y-3">
        {people.map((person) => (
          <div
            key={person.id}
            className={`rounded-xl border p-4 transition-colors ${
              person.is_primary
                ? "border-sky-200 bg-sky-50/50"
                : "border-gray-200 bg-white"
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
                  <img
                    src={person.profile_picture_url}
                    alt={person.name}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-gray-100 text-lg font-bold text-gray-400">
                    {person.name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)}
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
                  <h3 className="text-sm font-semibold text-gray-900">{person.name}</h3>
                  {person.is_primary && (
                    <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-semibold text-sky-700">
                      Primary
                    </span>
                  )}
                </div>
                {person.tagline && (
                  <p className="text-xs text-gray-500">{person.tagline}</p>
                )}
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
                {!person.is_primary && (
                  <button
                    onClick={() => handleSetPrimary(person.id)}
                    className="rounded-md border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
                  >
                    Set Primary
                  </button>
                )}
                <button
                  onClick={() => handleRemove(person.id)}
                  className="text-xs text-red-400 hover:text-red-600"
                >
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
        <div className="rounded-xl border border-sky-200 bg-sky-50 p-4 space-y-3">
          <h3 className="text-sm font-semibold text-gray-900">Add Person</h3>
          <div className="grid gap-3 sm:grid-cols-3">
            <input
              type="text"
              value={newPerson.name}
              onChange={(e) => setNewPerson({ ...newPerson, name: e.target.value })}
              placeholder="Full name"
              className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none"
            />
            <input
              type="text"
              value={newPerson.tagline}
              onChange={(e) => setNewPerson({ ...newPerson, tagline: e.target.value })}
              placeholder="Tagline (e.g. Founder, CEO)"
              className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none"
            />
            <input
              type="url"
              value={newPerson.linkedinUrl}
              onChange={(e) => setNewPerson({ ...newPerson, linkedinUrl: e.target.value })}
              placeholder="LinkedIn URL"
              className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none"
            />
          </div>
          {saveError && (
            <p className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
              {saveError}
            </p>
          )}
          <div className="flex gap-2">
            <button
              onClick={handleAdd}
              disabled={saving || !newPerson.name}
              className="rounded-md bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-50"
            >
              {saving ? "Adding..." : "Add"}
            </button>
            <button
              onClick={() => { setAdding(false); setSaveError(null); }}
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
