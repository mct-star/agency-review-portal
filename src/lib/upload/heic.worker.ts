/// <reference lib="webworker" />
import libheif from "libheif-js/wasm-bundle";
import { decodeHeic } from "./heic-decode";

// Runs the decode off the main thread so a folder of 200 HEIC photos does
// not freeze the page.
self.onmessage = async (event: MessageEvent<{ id: number; buffer: ArrayBuffer }>) => {
  const { id, buffer } = event.data;
  try {
    const img = await decodeHeic(libheif, buffer);
    const pixels = img.data.buffer as ArrayBuffer;
    (self as unknown as Worker).postMessage({ id, width: img.width, height: img.height, pixels }, [pixels]);
  } catch (err) {
    (self as unknown as Worker).postMessage({ id, error: err instanceof Error ? err.message : "Could not decode" });
  }
};
