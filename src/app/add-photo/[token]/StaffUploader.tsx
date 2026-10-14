"use client";

import { useEffect, useRef, useState } from "react";
import { useBulkUpload } from "@/lib/upload/use-bulk-upload";
import { collectFromInput } from "@/lib/upload/collect-files";

const NAME_KEY = "staff-upload-name";

/** The page staff open on their phone. Plain words, one big button. */
export default function StaffUploader({ token, companyName }: { token: string; companyName: string }) {
  const [name, setName] = useState("");
  const nameRef = useRef("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const saved = localStorage.getItem(NAME_KEY) || "";
    setName(saved);
    nameRef.current = saved;
  }, []);

  const { items, summary, addFiles, retry, retryAll } = useBulkUpload({
    signUrl: `/api/staff-upload/${token}/sign`,
    registerUrl: `/api/staff-upload/${token}/register`,
    body: {},
    registerBody: () => ({ submittedBy: nameRef.current || undefined }),
    allowVideo: false,
  });

  return (
    <main className="mx-auto min-h-screen max-w-md px-6 py-10">
      <h1 className="text-2xl font-semibold text-gray-900">Add a photo to the {companyName} library</h1>
      <p className="mt-2 text-sm text-gray-600">
        Pick photos from your phone. A manager has a quick look before any of them are used.
      </p>

      <label className="mt-6 block text-sm">
        <span className="font-medium text-gray-800">Your first name (optional)</span>
        <input
          value={name}
          onChange={(e) => { setName(e.target.value); nameRef.current = e.target.value; localStorage.setItem(NAME_KEY, e.target.value); }}
          maxLength={60}
          autoComplete="given-name"
          className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-base"
        />
      </label>

      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="mt-5 w-full rounded-lg bg-gray-900 px-4 py-4 text-base font-medium text-white active:bg-gray-700"
      >
        Choose photos
      </button>
      <input ref={inputRef} type="file" multiple accept="image/*,.heic,.heif" className="hidden"
        onChange={(e) => { addFiles(collectFromInput(e.target.files)); e.target.value = ""; }} />
      <p className="mt-2 text-xs text-gray-500">Photos only, up to 25 MB each.</p>

      {items.length > 0 && (
        <section className="mt-6" aria-live="polite">
          <p className="text-sm font-medium text-gray-800">
            {summary.active > 0
              ? `Sending ${summary.active} ${summary.active === 1 ? "photo" : "photos"}...`
              : summary.done + summary.exists > 0 && summary.error === 0
                ? "Thank you. Your photos have been sent."
                : "Done."}
            {summary.done + summary.exists > 0 && summary.active > 0 ? ` ${summary.done + summary.exists} sent so far.` : ""}
          </p>
          {summary.error > 0 && (
            <button type="button" onClick={retryAll} className="mt-2 text-sm font-medium text-violet-700 underline">Try the {summary.error} that did not send again</button>
          )}
          <ul className="mt-3 space-y-1.5">
            {items.filter((i) => i.status === "error" || i.status === "uploading" || i.status === "preparing" || i.status === "saving").slice(0, 10).map((i) => (
              <li key={i.id} className="rounded-md bg-gray-50 px-3 py-2 text-xs">
                <div className="flex justify-between gap-3">
                  <span className="truncate text-gray-800">{i.name}</span>
                  <span className={i.status === "error" ? "text-red-600" : "text-gray-500"}>
                    {i.status === "uploading" ? `${Math.round(i.progress * 100)}%` : i.status === "error" ? "Did not send" : i.message || "Working"}
                  </span>
                </div>
                {i.status === "error" && (
                  <div className="mt-1 flex justify-between gap-3 text-red-600">
                    <span>{i.error}</span>
                    <button type="button" onClick={() => retry(i.id)} className="shrink-0 font-medium text-violet-700">Retry</button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
