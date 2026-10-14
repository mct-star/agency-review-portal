/**
 * PUT a file at a Supabase signed upload URL, with progress.
 * XMLHttpRequest rather than fetch only because fetch has no upload
 * progress event. Mirrors what @supabase/storage-js does in
 * uploadToSignedUrl: PUT, x-upsert as a string, content-type from the file.
 */

export class UploadNetworkError extends Error {}

export function putToSignedUrl(
  file: Blob,
  contentType: string,
  signedUrl: string,
  onProgress: (fraction: number) => void,
  registerAbort?: (abort: () => void) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    registerAbort?.(() => xhr.abort());
    xhr.open("PUT", signedUrl, true);
    xhr.setRequestHeader("x-upsert", "false");
    xhr.setRequestHeader("cache-control", "max-age=3600");
    if (contentType) xhr.setRequestHeader("content-type", contentType);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && e.total > 0) onProgress(e.loaded / e.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(1);
        resolve();
      } else {
        reject(new Error(`Upload rejected (${xhr.status}): ${xhr.responseText || xhr.statusText}`));
      }
    };
    xhr.onerror = () => reject(new UploadNetworkError("Network error during upload"));
    xhr.ontimeout = () => reject(new UploadNetworkError("Upload timed out"));
    xhr.onabort = () => reject(new Error("Upload cancelled"));
    xhr.send(file);
  });
}
