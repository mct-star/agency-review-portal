"use client";

import { useState, useRef } from "react";

interface ImageUploaderProps {
  companyId: string;
  currentUrl: string | null;
  uploadType: "logo" | "profile_picture";
  label: string;
  size?: number;
  rounded?: boolean;
}

/**
 * Inline image uploader with preview.
 * Shows current image or a placeholder. Click to upload.
 */
export default function ImageUploader({
  companyId,
  currentUrl,
  uploadType,
  label,
  size = 64,
  rounded = false,
}: ImageUploaderProps) {
  const [imageUrl, setImageUrl] = useState(currentUrl);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUpload = async (file: File) => {
    setUploading(true);
    const formData = new FormData();
    formData.append("file", file);
    formData.append("companyId", companyId);
    formData.append("type", uploadType);

    try {
      const res = await fetch("/api/upload/logo", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (res.ok && data.url) {
        setImageUrl(data.url);
      }
    } catch {
      // Upload failed silently
    } finally {
      setUploading(false);
    }
  };

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleUpload(file);
        }}
      />
      <button
        onClick={() => fileInputRef.current?.click()}
        disabled={uploading}
        className={`group relative overflow-hidden border-2 border-dashed transition-colors hover:border-sky-400 ${
          rounded ? "rounded-full" : "rounded-xl"
        } ${imageUrl ? "border-transparent" : "border-gray-300"}`}
        style={{ width: size, height: size }}
        title={`Upload ${label}`}
      >
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={label}
            className={`h-full w-full object-cover ${rounded ? "rounded-full" : "rounded-xl"}`}
          />
        ) : (
          <div className={`flex h-full w-full items-center justify-center bg-gray-50 ${rounded ? "rounded-full" : "rounded-xl"}`}>
            <div className="text-center">
              <svg className="mx-auto h-5 w-5 text-gray-300 group-hover:text-sky-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              <p className="mt-0.5 text-[8px] font-medium text-gray-400 group-hover:text-sky-500">{label}</p>
            </div>
          </div>
        )}

        {/* Hover overlay */}
        <div className={`absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100 ${rounded ? "rounded-full" : "rounded-xl"}`}>
          <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </div>

        {uploading && (
          <div className={`absolute inset-0 flex items-center justify-center bg-white/80 ${rounded ? "rounded-full" : "rounded-xl"}`}>
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-sky-200 border-t-sky-600" />
          </div>
        )}
      </button>
    </>
  );
}
