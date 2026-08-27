"use client";

import { useCallback, useRef, useState } from "react";
import { CAPTURES_BUCKET, type MediaKind } from "./media-constants";

/**
 * Browser-direct upload into Supabase Storage.
 *
 * The file never passes through a Next.js route. The server mints a
 * signed upload URL, the browser PUTs the bytes at Supabase, and only
 * then does a second small JSON call tell the server what arrived.
 * A 2GB clip cannot reach Supabase any other way from production,
 * because Vercel refuses a function request body over 4.5MB.
 *
 * The PUT below mirrors what @supabase/storage-js does in
 * uploadToSignedUrl, verified against the installed source
 * (node_modules/@supabase/storage-js/src/packages/StorageFileApi.ts):
 * method PUT, `x-upsert` as a string, `cache-control: max-age=3600`
 * and `content-type` set from the file for a non-FormData body.
 *
 * No Authorization or apikey header is sent. The upload token lives
 * in the signed URL's query string and the storage route
 * (PUT /object/upload/sign/:bucket/*) authenticates from that token
 * alone, which is why the browser needs no Supabase credentials.
 *
 * XMLHttpRequest rather than fetch, only because fetch still has no
 * upload progress event. Progress on a multi-minute phone upload is
 * the difference between waiting and force-quitting.
 */

export interface DirectUploadOptions {
  companyId: string;
  kind: MediaKind;
  onProgress?: (fraction: number) => void;
}

export interface DirectUploadResult {
  bucket: string;
  path: string;
  sha256: string | null;
}

export type DirectUploadStatus =
  | "idle"
  | "hashing"
  | "signing"
  | "uploading"
  | "done"
  | "error";

/**
 * Hashing needs the whole file in memory at once. A 2GB .mov would
 * crash the tab before the upload started, and would add minutes of
 * dead time first. The hash only exists to dedupe the photo bank, so
 * large video simply goes without one and the server falls back to
 * the storage path as its file_ref.
 */
const MAX_HASHABLE_VIDEO_BYTES = 100 * 1024 * 1024;

const RETRY_DELAY_MS = 400;

class UploadNetworkError extends Error {}

function shouldHash(file: File, kind: MediaKind): boolean {
  if (kind === "photo") return true;
  return file.size <= MAX_HASHABLE_VIDEO_BYTES;
}

async function sha256Hex(file: File): Promise<string | null> {
  // crypto.subtle only exists in a secure context. On plain http the
  // upload still has to work, so this returns null rather than
  // throwing and the server uses the object key as the file_ref.
  if (typeof crypto === "undefined" || !crypto.subtle) return null;

  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

interface SignedTarget {
  bucket: string;
  path: string;
  token: string;
  signedUrl: string;
}

async function requestSignedTarget(
  file: File,
  options: DirectUploadOptions
): Promise<SignedTarget> {
  const res = await fetch("/api/upload/sign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      companyId: options.companyId,
      kind: options.kind,
      filename: file.name,
      mimeType: file.type,
      sizeBytes: file.size,
    }),
  });

  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(payload.error ?? `Could not get an upload URL (${res.status})`);
  }
  return payload as SignedTarget;
}

function putToSignedUrl(
  file: File,
  signedUrl: string,
  onProgress: (fraction: number) => void,
  registerAbort: (xhr: XMLHttpRequest) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    registerAbort(xhr);

    xhr.open("PUT", signedUrl, true);
    xhr.setRequestHeader("x-upsert", "false");
    xhr.setRequestHeader("cache-control", "max-age=3600");
    if (file.type) xhr.setRequestHeader("content-type", file.type);

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) {
        onProgress(event.loaded / event.total);
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(1);
        resolve();
        return;
      }
      // An HTTP status came back, so the network is fine and the
      // server has an opinion. Retrying would only repeat it.
      reject(new Error(`Upload rejected (${xhr.status}): ${xhr.responseText || xhr.statusText}`));
    };

    xhr.onerror = () => reject(new UploadNetworkError("Network error during upload"));
    xhr.ontimeout = () => reject(new UploadNetworkError("Upload timed out"));
    xhr.onabort = () => reject(new Error("Upload cancelled"));

    xhr.send(file);
  });
}

export function useDirectUpload() {
  const [status, setStatus] = useState<DirectUploadStatus>("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const activeRequest = useRef<XMLHttpRequest | null>(null);

  const cancel = useCallback(() => {
    activeRequest.current?.abort();
  }, []);

  const uploadFile = useCallback(
    async (file: File, options: DirectUploadOptions): Promise<DirectUploadResult> => {
      setError(null);
      setProgress(0);

      const report = (fraction: number) => {
        setProgress(fraction);
        options.onProgress?.(fraction);
      };

      try {
        setStatus("hashing");
        const sha256 = shouldHash(file, options.kind) ? await sha256Hex(file) : null;

        // One retry, and only for a network failure. Each attempt
        // signs afresh, which mints a new object key, so a first
        // attempt that died after the object landed cannot collide
        // with the retry under x-upsert false.
        let lastError: unknown;
        for (let attempt = 0; attempt < 2; attempt++) {
          if (attempt > 0) {
            await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
            report(0);
          }

          setStatus("signing");
          const target = await requestSignedTarget(file, options);

          setStatus("uploading");
          try {
            await putToSignedUrl(file, target.signedUrl, report, (xhr) => {
              activeRequest.current = xhr;
            });
            setStatus("done");
            return { bucket: target.bucket ?? CAPTURES_BUCKET, path: target.path, sha256 };
          } catch (err) {
            lastError = err;
            if (!(err instanceof UploadNetworkError)) throw err;
          } finally {
            activeRequest.current = null;
          }
        }

        throw lastError instanceof Error ? lastError : new Error("Upload failed");
      } catch (err) {
        const message = err instanceof Error ? err.message : "Upload failed";
        setStatus("error");
        setError(message);
        throw err;
      }
    },
    []
  );

  return { uploadFile, cancel, status, progress, error };
}
