"use client";

import { useState, useEffect, useRef } from "react";

interface ComplianceDocument {
  id: string;
  name: string;
  description: string | null;
  category: string;
  file_url: string;
  file_name: string;
  file_size_bytes: number | null;
  mime_type: string | null;
  extraction_status: string;
  is_active: boolean;
  use_in_reviews: boolean;
  created_at: string;
}

interface Props {
  companyId: string;
}

const CATEGORY_OPTIONS = [
  { value: "claims_matrix", label: "Claims Matrix", description: "What you CAN and CANNOT say about products" },
  { value: "messaging_house", label: "Messaging House", description: "Approved language and positioning" },
  { value: "brand_guidelines", label: "Brand Guidelines", description: "Tone, terminology, visual standards" },
  { value: "regulatory_policy", label: "Regulatory Policy", description: "Company-specific compliance rules" },
  { value: "product_information", label: "Product Information", description: "Product data sheets, SmPCs" },
  { value: "custom", label: "Custom", description: "Other compliance-relevant document" },
];

const CATEGORY_COLORS: Record<string, string> = {
  claims_matrix: "bg-red-50 text-red-700 border-red-200",
  messaging_house: "bg-violet-50 text-violet-700 border-violet-200",
  brand_guidelines: "bg-blue-50 text-blue-700 border-blue-200",
  regulatory_policy: "bg-amber-50 text-amber-700 border-amber-200",
  product_information: "bg-green-50 text-green-700 border-green-200",
  custom: "bg-gray-50 text-gray-700 border-gray-200",
};

function formatFileSize(bytes: number | null): string {
  if (!bytes) return "Unknown size";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function ComplianceDocuments({ companyId }: Props) {
  const [documents, setDocuments] = useState<ComplianceDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [uploadName, setUploadName] = useState("");
  const [uploadCategory, setUploadCategory] = useState("claims_matrix");
  const [uploadDescription, setUploadDescription] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchDocuments();
  }, [companyId]);

  async function fetchDocuments() {
    setLoading(true);
    try {
      const res = await fetch(`/api/compliance/documents?companyId=${companyId}`);
      const data = await res.json();
      setDocuments(data.documents || []);
    } catch {
      console.error("Failed to fetch documents");
    } finally {
      setLoading(false);
    }
  }

  async function handleUpload() {
    const file = fileRef.current?.files?.[0];
    if (!file || !uploadName) return;

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("companyId", companyId);
      formData.append("name", uploadName);
      formData.append("category", uploadCategory);
      if (uploadDescription) formData.append("description", uploadDescription);

      const res = await fetch("/api/compliance/documents", {
        method: "POST",
        body: formData,
      });

      if (res.ok) {
        await fetchDocuments();
        setShowUpload(false);
        setUploadName("");
        setUploadDescription("");
        if (fileRef.current) fileRef.current.value = "";
      } else {
        const err = await res.json();
        alert(err.error || "Upload failed");
      }
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(docId: string) {
    if (!confirm("Delete this document? This cannot be undone.")) return;
    const res = await fetch("/api/compliance/documents", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ documentId: docId, companyId }),
    });
    if (res.ok) {
      setDocuments((prev) => prev.filter((d) => d.id !== docId));
    }
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
        <div className="flex items-center gap-3">
          <svg className="h-5 w-5 text-slate-700" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
          </svg>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Compliance Documents</h2>
            <p className="text-xs text-gray-500">Upload claims matrices, messaging houses, and brand guidelines for smarter reviews</p>
          </div>
        </div>
        <button
          onClick={() => setShowUpload(!showUpload)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-slate-800 px-4 py-2 text-xs font-medium text-white shadow-sm hover:bg-slate-700 transition-colors"
        >
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Upload Document
        </button>
      </div>

      {/* Upload form */}
      {showUpload && (
        <div className="border-b border-gray-100 bg-gray-50/50 px-6 py-5 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Document Name</label>
              <input
                type="text"
                value={uploadName}
                onChange={(e) => setUploadName(e.target.value)}
                placeholder="e.g. Product X Claims Matrix 2026"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Category</label>
              <select
                value={uploadCategory}
                onChange={(e) => setUploadCategory(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
              >
                {CATEGORY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label} — {opt.description}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Description (optional)</label>
            <input
              type="text"
              value={uploadDescription}
              onChange={(e) => setUploadDescription(e.target.value)}
              placeholder="What does this document cover?"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">File (PDF, DOCX, TXT, CSV — max 10MB)</label>
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.docx,.txt,.csv,.json"
              className="w-full text-sm text-gray-500 file:mr-4 file:rounded-lg file:border-0 file:bg-slate-100 file:px-4 file:py-2 file:text-sm file:font-medium file:text-slate-700 hover:file:bg-slate-200"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setShowUpload(false)}
              className="rounded-lg border border-gray-300 px-4 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={handleUpload}
              disabled={uploading || !uploadName || !fileRef.current?.files?.length}
              className="rounded-lg bg-violet-600 px-4 py-2 text-xs font-medium text-white shadow-sm hover:bg-violet-700 disabled:opacity-50 transition-colors"
            >
              {uploading ? "Uploading..." : "Upload"}
            </button>
          </div>
        </div>
      )}

      {/* Document list */}
      <div className="divide-y divide-gray-50">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <svg className="h-6 w-6 animate-spin text-gray-300" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          </div>
        ) : documents.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <svg className="h-10 w-10 text-gray-200" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
            <p className="mt-3 text-sm text-gray-500">No compliance documents uploaded yet</p>
            <p className="mt-1 text-xs text-gray-400">Upload a claims matrix or messaging house to improve review accuracy</p>
          </div>
        ) : (
          documents.map((doc) => (
            <div key={doc.id} className="flex items-center justify-between px-6 py-3 hover:bg-gray-50 transition-colors">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <div className="flex-shrink-0">
                  {doc.extraction_status === "complete" ? (
                    <span className="inline-block h-2.5 w-2.5 rounded-full bg-green-500" title="Text extracted" />
                  ) : doc.extraction_status === "processing" ? (
                    <span className="inline-block h-2.5 w-2.5 rounded-full bg-amber-500 animate-pulse" title="Processing" />
                  ) : (
                    <span className="inline-block h-2.5 w-2.5 rounded-full bg-gray-300" title="Pending extraction" />
                  )}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-medium text-gray-900">{doc.name}</p>
                    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${CATEGORY_COLORS[doc.category] || CATEGORY_COLORS.custom}`}>
                      {CATEGORY_OPTIONS.find((c) => c.value === doc.category)?.label || doc.category}
                    </span>
                  </div>
                  <div className="mt-0.5 flex items-center gap-2 text-xs text-gray-400">
                    <span>{doc.file_name}</span>
                    <span>&middot;</span>
                    <span>{formatFileSize(doc.file_size_bytes)}</span>
                    <span>&middot;</span>
                    <span>{new Date(doc.created_at).toLocaleDateString()}</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <a
                  href={doc.file_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                  title="Download"
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                </a>
                <button
                  onClick={() => handleDelete(doc.id)}
                  className="rounded p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                  title="Delete"
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                  </svg>
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
