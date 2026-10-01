import { createHash } from "node:crypto";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const lib = vi.hoisted(() => ({ heicTo: vi.fn() }));
vi.mock("heic-to", () => ({ heicTo: lib.heicTo }));

import { prepareImageForUpload } from "./heic";
import { useDirectUpload } from "./use-direct-upload";

/**
 * The bank is matched back to local files by content hash: register writes
 * file_ref as "sha256:<hex>" from the sha256 that uploadFile returns. For a
 * converted HEIC that hash has to describe the JPEG sitting in storage, or
 * the match silently fails. These tests run the real hook against a fake
 * storage PUT and hash the bytes that were actually sent, independently.
 */

const COMPANY_ID = "11111111-2222-4333-8444-555555555555";

const heicBytes = new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112, 104, 101, 105, 99, 1, 2, 3, 4, 5, 6, 7, 8]);
const jpegBytes = new Uint8Array([255, 216, 255, 224, 0, 16, 74, 70, 73, 70, 9, 8, 7, 6, 5, 4, 3, 2, 1, 255, 217]);

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/** Stands in for XMLHttpRequest and keeps whatever is PUT at the signed URL. */
class FakeXhr {
  static puts: Blob[] = [];
  upload: { onprogress: ((event: unknown) => void) | null } = { onprogress: null };
  status = 200;
  statusText = "OK";
  responseText = "";
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  ontimeout: (() => void) | null = null;
  onabort: (() => void) | null = null;
  open() {}
  setRequestHeader() {}
  abort() {}
  send(body: Blob) {
    FakeXhr.puts.push(body);
    setTimeout(() => this.onload?.(), 0);
  }
}

/**
 * Renders a throwaway component once on the server to get hold of the
 * hook's uploadFile. State setters are no-ops after a server render, which
 * is fine because only the returned values are under test.
 */
function mountUploadHook() {
  let hook!: ReturnType<typeof useDirectUpload>;
  function Probe() {
    hook = useDirectUpload();
    return null;
  }
  renderToString(createElement(Probe));
  return hook;
}

let signRequests: Array<Record<string, unknown>>;

beforeEach(() => {
  FakeXhr.puts = [];
  signRequests = [];
  vi.stubGlobal("XMLHttpRequest", FakeXhr);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: { body: string }) => {
      signRequests.push(JSON.parse(init.body));
      return new Response(
        JSON.stringify({
          bucket: "captures",
          path: `${COMPANY_ID}/photos/stored.jpg`,
          token: "token",
          signedUrl: "https://storage.invalid/upload?token=token",
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    })
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  lib.heicTo.mockReset();
});

describe("the sha256 handed to /api/media/register", () => {
  it("is the hash of the JPEG that reached storage, never of the HEIC that was dropped", async () => {
    lib.heicTo.mockResolvedValue(new Blob([jpegBytes], { type: "image/jpeg" }));
    const dropped = new File([heicBytes], "IMG_0042.HEIC", { type: "" });

    const photo = await prepareImageForUpload(dropped);
    const uploaded = await mountUploadHook().uploadFile(photo, { companyId: COMPANY_ID, kind: "photo" });

    expect(FakeXhr.puts).toHaveLength(1);
    const stored = new Uint8Array(await FakeXhr.puts[0].arrayBuffer());
    expect(stored).toEqual(jpegBytes);

    expect(uploaded.sha256).toBe(sha256(stored));
    expect(uploaded.sha256).toBe(sha256(jpegBytes));
    expect(uploaded.sha256).not.toBe(sha256(heicBytes));
  });

  it("goes with a sign request that describes the JPEG, not the HEIC", async () => {
    lib.heicTo.mockResolvedValue(new Blob([jpegBytes], { type: "image/jpeg" }));
    const dropped = new File([heicBytes], "IMG_0042.HEIC", { type: "image/heic" });

    const photo = await prepareImageForUpload(dropped);
    await mountUploadHook().uploadFile(photo, { companyId: COMPANY_ID, kind: "photo" });

    expect(signRequests).toHaveLength(1);
    expect(signRequests[0]).toMatchObject({
      companyId: COMPANY_ID,
      kind: "photo",
      filename: "IMG_0042.jpg",
      mimeType: "image/jpeg",
      sizeBytes: jpegBytes.length,
    });
  });

  it("is unchanged for a JPEG, which is uploaded exactly as dropped", async () => {
    const dropped = new File([jpegBytes], "IMG_0043.jpg", { type: "image/jpeg" });

    const photo = await prepareImageForUpload(dropped);
    const uploaded = await mountUploadHook().uploadFile(photo, { companyId: COMPANY_ID, kind: "photo" });

    expect(photo).toBe(dropped);
    expect(lib.heicTo).not.toHaveBeenCalled();
    expect(new Uint8Array(await FakeXhr.puts[0].arrayBuffer())).toEqual(jpegBytes);
    expect(uploaded.sha256).toBe(sha256(jpegBytes));
  });

  it("is unchanged for a PNG", async () => {
    const pngBytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3]);
    const dropped = new File([pngBytes], "card.png", { type: "image/png" });

    const photo = await prepareImageForUpload(dropped);
    const uploaded = await mountUploadHook().uploadFile(photo, { companyId: COMPANY_ID, kind: "photo" });

    expect(lib.heicTo).not.toHaveBeenCalled();
    expect(uploaded.sha256).toBe(sha256(pngBytes));
  });
});
