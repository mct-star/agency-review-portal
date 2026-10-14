import { describe, expect, it } from "vitest";
import { CONNECTION_DROPPED, friendlyTransportError } from "./errors";

describe("friendlyTransportError", () => {
  it("never shows a developer message", () => {
    const raw = "tus: unexpected response while creating upload, originated from request (method: POST, url: https://x.storage.supabase.co/..., response code: 401, response text: bad signature)";
    const out = friendlyTransportError(new Error(raw));
    expect(out).not.toMatch(/tus|supabase|storage|signature|https/i);
    expect(out).toBe("The upload permission ran out. Tap Retry.");
  });
  it("explains a dropped connection", () => {
    expect(friendlyTransportError(new Error("Network error during upload"))).toBe(CONNECTION_DROPPED);
    expect(friendlyTransportError(new TypeError("Failed to fetch"))).toBe(CONNECTION_DROPPED);
    expect(friendlyTransportError(new Error("tus: failed to upload chunk at offset 6291456"))).toBe(CONNECTION_DROPPED);
  });
  it("explains a file that is too big", () => {
    expect(friendlyTransportError(new Error("Upload rejected (413): {}"))).toBe("That file is too big.");
  });
  it("has a safe fallback", () => {
    expect(friendlyTransportError(new Error("???"))).toBe("That one did not upload. Tap Retry.");
    expect(friendlyTransportError(undefined)).toBe("That one did not upload. Tap Retry.");
  });
});
