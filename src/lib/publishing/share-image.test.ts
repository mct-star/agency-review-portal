import { describe, expect, it } from "vitest";
import { MAX_SHARE_BYTES, SHARE_TOO_LARGE, shareFileProblem, shareUploadError } from "./share-image";

describe("the share image pre-check the panel runs before sending", () => {
  it("caps at 4 MB, below the host's 4.5 MB request limit", () => {
    expect(MAX_SHARE_BYTES).toBe(4 * 1024 * 1024);
    expect(MAX_SHARE_BYTES).toBeLessThan(4.5 * 1024 * 1024);
  });
  it("lets a file of 4 MB or less through", () => {
    expect(shareFileProblem({ size: MAX_SHARE_BYTES })).toBeNull();
    expect(shareFileProblem({ size: 1 })).toBeNull();
  });
  it("stops a larger file with the plain sentence", () => {
    expect(shareFileProblem({ size: MAX_SHARE_BYTES + 1 })).toBe("That file is too large. The share image must be 4 MB or smaller.");
    expect(shareFileProblem({ size: 4.7 * 1024 * 1024 })).toBe(SHARE_TOO_LARGE);
  });
});

describe("the panel's reading of a failed upload", () => {
  it("shows the size sentence for a 413, whatever the body", () => {
    expect(shareUploadError(413, null)).toBe(SHARE_TOO_LARGE);
    expect(shareUploadError(413, { error: "Request Entity Too Large" })).toBe(SHARE_TOO_LARGE);
  });
  it("shows the size sentence when the response is not JSON", () => {
    expect(shareUploadError(500, null)).toBe(SHARE_TOO_LARGE);
  });
  it("shows the route's own sentence otherwise", () => {
    expect(shareUploadError(409, { error: "This piece is being published right now. Try again in a minute." }))
      .toBe("This piece is being published right now. Try again in a minute.");
    expect(shareUploadError(500, {})).toBe("The share image could not be uploaded.");
  });
});
