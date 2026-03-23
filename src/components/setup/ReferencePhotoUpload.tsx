"use client";

import { useState, useRef } from "react";

/**
 * Reference Photo Upload — lets users upload 3-5 photos of themselves
 * to help AI generate more accurate Pixar-style characters that
 * resemble the real person.
 */

interface ReferencePhotoUploadProps {
  companyId: string;
  spokespersonId: string;
  spokespersonName: string;
  existingPhotos: string[];
  onPhotosChange: (photos: string[]) => void;
}

export default function ReferencePhotoUpload({
  companyId,
  spokespersonId,
  spokespersonName,
  existingPhotos,
  onPhotosChange,
}: ReferencePhotoUploadProps) {
  const [photos, setPhotos] = useState<string[]>(existingPhotos);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    setError(null);

    const newPhotos = [...photos];

    for (let i = 0; i < files.length; i++) {
      if (newPhotos.length >= 5) {
        setError("Maximum 5 reference photos allowed");
        break;
      }

      const file = files[i];
      if (file.size > 5 * 1024 * 1024) {
        setError("Each photo must be under 5MB");
        continue;
      }

      const formData = new FormData();
      formData.append("file", file);
      formData.append("companyId", companyId);
      formData.append("type", "reference_photo");
      formData.append("spokespersonId", spokespersonId);
      formData.append("index", String(newPhotos.length));

      try {
        const res = await fetch("/api/upload/logo", {
          method: "POST",
          body: formData,
        });

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || "Upload failed");
        }

        const data = await res.json();
        if (data.url) {
          newPhotos.push(data.url);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Upload failed");
      }
    }

    setPhotos(newPhotos);
    onPhotosChange(newPhotos);
    setUploading(false);

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  function handleRemove(index: number) {
    const updated = photos.filter((_, i) => i !== index);
    setPhotos(updated);
    onPhotosChange(updated);
  }

  return (
    <div className="space-y-4">
      <div>
        <h4 className="text-sm font-semibold text-gray-900">Reference Photos</h4>
        <p className="mt-1 text-xs text-gray-500">
          Upload 3-5 photos of {spokespersonName} from different angles and settings.
          These help AI generate characters that more closely resemble the real person
          in 3D character and illustrated images.
        </p>
      </div>

      {/* Photo grid */}
      <div className="flex flex-wrap gap-3">
        {photos.map((url, i) => (
          <div key={i} className="group relative h-20 w-20 overflow-hidden rounded-lg border border-gray-200">
            <img src={url} alt={`Reference ${i + 1}`} className="h-full w-full object-cover" />
            <button
              onClick={() => handleRemove(i)}
              className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 transition-opacity group-hover:opacity-100"
            >
              <svg className="h-5 w-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        ))}

        {photos.length < 5 && (
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="flex h-20 w-20 items-center justify-center rounded-lg border-2 border-dashed border-gray-300 text-gray-400 hover:border-violet-400 hover:text-violet-500 transition-colors disabled:opacity-50"
          >
            {uploading ? (
              <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            ) : (
              <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M12 4v16m8-8H4" />
              </svg>
            )}
          </button>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        multiple
        onChange={handleUpload}
        className="hidden"
      />

      {error && (
        <p className="text-xs text-red-600">{error}</p>
      )}

      <p className="text-[10px] text-gray-400">
        {photos.length}/5 photos uploaded. Best results with: headshot, full body, side profile, candid, and professional setting.
      </p>
    </div>
  );
}
