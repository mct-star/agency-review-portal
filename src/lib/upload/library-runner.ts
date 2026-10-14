import { classifyFile, mimeForPhoto, mimeForVideo, sizeProblem } from "./file-kind";
import { fingerprintFile } from "./fingerprint";
import { convertHeicToJpeg } from "./heic";
import { putToSignedUrl, UploadNetworkError } from "./put-upload";
import { tusUpload } from "./tus-upload";
import { RESUMABLE_THRESHOLD_BYTES } from "./tus-endpoint";
import { extractVideoFrames } from "./video-frames";
import type { Runner } from "./upload-queue";

/**
 * The browser pipeline for one file going into the library:
 *
 *   read type, convert HEIC to JPEG, fingerprint the original,
 *   ask the server to sign (it answers "already in the library" for a known
 *   fingerprint, and refuses over-quota), upload (a plain PUT for photos and
 *   short clips, resumable chunks for a large video), then register (the
 *   server makes the thumbnail and starts the automatic tags).
 *
 * The same runner serves the signed-in library and the staff upload link;
 * only the two addresses and the body that rides along differ.
 */

export interface RunnerConfig {
  signUrl: string;
  registerUrl: string;
  /** Sent with both calls, for example { companyId } */
  body: Record<string, unknown>;
  /** Sent with register only, for example the target and who it is from. A function is read at the moment of registering, so it can follow a text box without resetting the queue. */
  registerBody?: Record<string, unknown> | (() => Record<string, unknown>);
  allowVideo: boolean;
}

interface SignResponse {
  alreadyExists?: boolean;
  error?: string;
  bucket?: string;
  path?: string;
  token?: string;
  signedUrl?: string;
  tusEndpoint?: string;
}

const PATH_KEY = (fp: string) => `library-upload-path:${fp}`;

async function postJson(url: string, body: unknown): Promise<{ ok: boolean; data: Record<string, unknown> }> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, data };
}

async function readDimensions(blob: Blob): Promise<{ width: number | null; height: number | null }> {
  try {
    const bmp = await createImageBitmap(blob);
    const out = { width: bmp.width, height: bmp.height };
    bmp.close();
    return out;
  } catch {
    return { width: null, height: null };
  }
}

export function createLibraryRunner(cfg: RunnerConfig): Runner<File> {
  return async (original, item, update) => {
    const kind = classifyFile(original);
    if (!kind) throw new Error("Not a photo or video we can use (JPEG, PNG, WebP, HEIC, MP4, MOV or WebM)");
    if (kind === "video" && !cfg.allowVideo) throw new Error("Only photos can be added here");

    update({ status: "preparing", message: "Checking" });
    // Fingerprint the file as it came off the phone, so the same HEIC is
    // recognised however many times it is picked.
    const sha256 = await fingerprintFile(original);

    let file: File = original;
    let width: number | null = null;
    let height: number | null = null;
    let duration: number | null = null;
    let frames: string[] = [];
    let contentType: string;
    const uploadKind: "photo" | "video" = kind === "video" ? "video" : "photo";

    if (kind === "heic") {
      update({ message: "Converting" });
      const converted = await convertHeicToJpeg(original);
      file = converted.file;
      width = converted.width;
      height = converted.height;
      contentType = "image/jpeg";
    } else if (kind === "photo") {
      contentType = mimeForPhoto(original);
      ({ width, height } = await readDimensions(original));
    } else {
      contentType = mimeForVideo(original);
      update({ message: "Taking preview frames" });
      const info = await extractVideoFrames(original).catch(() => null);
      if (info) {
        frames = info.frames;
        width = info.width;
        height = info.height;
        duration = info.duration;
      }
    }

    const problem = sizeProblem(uploadKind, file.size);
    if (problem) throw new Error(problem);

    // A video picked again after a dropped connection or a closed tab goes
    // back to the same object key, so the resumable upload can carry on.
    const resumePath = uploadKind === "video" && sha256 ? localStorage.getItem(PATH_KEY(sha256)) : null;

    update({ message: "Starting" });
    const signed = await postJson(cfg.signUrl, {
      ...cfg.body,
      kind: uploadKind,
      filename: file.name,
      mimeType: contentType,
      sizeBytes: file.size,
      sha256,
      ...(resumePath ? { resumePath } : {}),
    });
    const sign = signed.data as SignResponse;
    if (!signed.ok) throw new Error(sign.error || "Could not start the upload");
    if (sign.alreadyExists) return "exists";
    if (!sign.path || !sign.signedUrl || !sign.token) throw new Error("The upload could not be started");

    update({ status: "uploading", message: undefined, progress: 0 });
    const onProgress = (f: number) => update({ progress: f });

    if (uploadKind === "video" && file.size >= RESUMABLE_THRESHOLD_BYTES && sign.tusEndpoint) {
      if (sha256) localStorage.setItem(PATH_KEY(sha256), sign.path);
      await tusUpload({
        file,
        endpoint: sign.tusEndpoint,
        token: sign.token,
        path: sign.path,
        contentType,
        onProgress,
        renewToken: async () => {
          const r = await postJson(cfg.signUrl, {
            ...cfg.body,
            kind: uploadKind,
            filename: file.name,
            mimeType: contentType,
            sizeBytes: file.size,
            resumePath: sign.path,
          });
          const d = r.data as SignResponse;
          if (!r.ok || !d.token) throw new Error(d.error || "Could not renew the upload");
          return d.token;
        },
      });
    } else {
      // One retry on a dropped connection, with a fresh signature.
      let lastError: unknown;
      let target = sign;
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          await putToSignedUrl(file, contentType, target.signedUrl!, onProgress);
          lastError = null;
          break;
        } catch (err) {
          lastError = err;
          if (!(err instanceof UploadNetworkError) || attempt === 1) break;
          const again = await postJson(cfg.signUrl, {
            ...cfg.body,
            kind: uploadKind,
            filename: file.name,
            mimeType: contentType,
            sizeBytes: file.size,
          });
          if (!again.ok) break;
          target = again.data as SignResponse;
          sign.path = target.path;
        }
      }
      if (lastError) throw lastError instanceof Error ? lastError : new Error("Upload failed");
    }

    update({ status: "saving", progress: 1, message: "Saving" });
    const registered = await postJson(cfg.registerUrl, {
      ...cfg.body,
      kind: uploadKind,
      bucket: sign.bucket,
      path: sign.path,
      mimeType: contentType,
      sizeBytes: file.size,
      originalFilename: original.name,
      sha256,
      width,
      height,
      durationSeconds: duration,
      weekNumber: null,
      frames,
      ...(typeof cfg.registerBody === "function" ? cfg.registerBody() : cfg.registerBody ?? {}),
    });
    if (sha256) localStorage.removeItem(PATH_KEY(sha256));
    if (!registered.ok) throw new Error((registered.data.error as string) || "Could not save the file");
    return registered.data.alreadyExists ? "exists" : "done";
  };
}
