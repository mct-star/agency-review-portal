import * as tus from "tus-js-client";
import { CAPTURES_BUCKET } from "./media-constants";
import { TUS_CHUNK_BYTES } from "./tus-endpoint";

/**
 * Resumable (TUS) upload into Supabase Storage with a server-minted signed
 * token (header `x-signature`), no user session needed.
 *
 * A 2 GB clip goes up in 6 MB chunks. If the connection drops, the client
 * retries each chunk with back-off, and if the tab is closed or reloaded the
 * same file picked again resumes where it stopped (tus-js-client keeps the
 * upload URL in localStorage against the file's fingerprint). The signed
 * token lasts about two hours, so it is renewed through `renewToken` before
 * it can expire part-way through a long upload.
 */

const TOKEN_REFRESH_AFTER_MS = 80 * 60 * 1000;

export interface TusUploadOptions {
  file: Blob;
  endpoint: string;
  token: string;
  path: string;
  contentType: string;
  renewToken: () => Promise<string>;
  onProgress: (fraction: number) => void;
  registerAbort?: (abort: () => void) => void;
}

export function tusUpload(opts: TusUploadOptions): Promise<void> {
  return new Promise((resolve, reject) => {
    let token = opts.token;
    let issuedAt = Date.now();

    const upload = new tus.Upload(opts.file, {
      endpoint: opts.endpoint,
      retryDelays: [0, 3000, 5000, 10000, 20000, 30000],
      uploadDataDuringCreation: false,
      removeFingerprintOnSuccess: true,
      chunkSize: TUS_CHUNK_BYTES,
      metadata: {
        bucketName: CAPTURES_BUCKET,
        objectName: opts.path,
        contentType: opts.contentType,
        cacheControl: "3600",
      },
      // The signature is set per request below. Setting it here as well would
      // send it twice, joined with a comma, which the server rejects.
      onBeforeRequest: async (req) => {
        if (Date.now() - issuedAt > TOKEN_REFRESH_AFTER_MS) {
          token = await opts.renewToken();
          issuedAt = Date.now();
        }
        req.setHeader("x-signature", token);
      },
      onProgress: (sent, total) => opts.onProgress(total > 0 ? sent / total : 0),
      onError: (err) => reject(err),
      onSuccess: () => {
        opts.onProgress(1);
        resolve();
      },
    });

    opts.registerAbort?.(() => void upload.abort());

    upload
      .findPreviousUploads()
      .then((previous) => {
        if (previous.length > 0) upload.resumeFromPreviousUpload(previous[0]);
        upload.start();
      })
      .catch(() => upload.start());
  });
}
