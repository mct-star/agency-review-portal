import { jpegName } from "./file-kind";

/**
 * Convert a HEIC photo to JPEG in the browser, before upload.
 * Phones default to HEIC, and the rest of the pipeline (sharp, the social
 * networks, the CSV import) cannot read it.
 */

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, { ok: (v: { width: number; height: number; pixels: ArrayBuffer }) => void; bad: (e: Error) => void }>();

function getWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL("./heic.worker.ts", import.meta.url), { type: "module" });
  worker.onmessage = (e: MessageEvent<{ id: number; width?: number; height?: number; pixels?: ArrayBuffer; error?: string }>) => {
    const waiter = pending.get(e.data.id);
    if (!waiter) return;
    pending.delete(e.data.id);
    if (e.data.error || !e.data.pixels) waiter.bad(new Error(e.data.error || "Could not convert the photo"));
    else waiter.ok({ width: e.data.width!, height: e.data.height!, pixels: e.data.pixels });
  };
  worker.onerror = () => {
    for (const w of pending.values()) w.bad(new Error("The photo converter failed to start"));
    pending.clear();
    worker = null;
  };
  return worker;
}

export async function convertHeicToJpeg(file: File, quality = 0.9): Promise<{ file: File; width: number; height: number }> {
  const buffer = await file.arrayBuffer();
  const id = nextId++;
  const decoded = await new Promise<{ width: number; height: number; pixels: ArrayBuffer }>((ok, bad) => {
    pending.set(id, { ok, bad });
    getWorker().postMessage({ id, buffer }, [buffer]);
  });

  const canvas = document.createElement("canvas");
  canvas.width = decoded.width;
  canvas.height = decoded.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser cannot convert the photo");
  ctx.putImageData(new ImageData(new Uint8ClampedArray(decoded.pixels), decoded.width, decoded.height), 0, 0);

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
  if (!blob) throw new Error("Could not make a JPEG from the photo");
  return {
    file: new File([blob], jpegName(file.name), { type: "image/jpeg", lastModified: file.lastModified }),
    width: decoded.width,
    height: decoded.height,
  };
}
