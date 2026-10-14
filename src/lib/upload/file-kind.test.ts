import { describe, expect, it } from "vitest";
import { classifyFile, isJunkFile, jpegName, mimeForVideo, sizeProblem } from "./file-kind";

describe("classifyFile", () => {
  it("recognises HEIC by type or by extension when the type is empty", () => {
    expect(classifyFile({ name: "IMG_1.HEIC", type: "" })).toBe("heic");
    expect(classifyFile({ name: "a.heif", type: "image/heif" })).toBe("heic");
    expect(classifyFile({ name: "a.jpg", type: "image/heic" })).toBe("heic");
  });
  it("recognises photos and videos", () => {
    expect(classifyFile({ name: "a.JPG", type: "image/jpeg" })).toBe("photo");
    expect(classifyFile({ name: "a.png", type: "" })).toBe("photo");
    expect(classifyFile({ name: "a.mov", type: "" })).toBe("video");
    expect(classifyFile({ name: "a.mp4", type: "video/mp4" })).toBe("video");
  });
  it("refuses anything else", () => {
    expect(classifyFile({ name: "a.pdf", type: "application/pdf" })).toBeNull();
    expect(classifyFile({ name: "notes", type: "" })).toBeNull();
  });
});

describe("helpers", () => {
  it("skips hidden and system files from a dropped folder", () => {
    expect(isJunkFile(".DS_Store")).toBe(true);
    expect(isJunkFile("Thumbs.db")).toBe(true);
    expect(isJunkFile("IMG_1.jpg")).toBe(false);
  });
  it("names the converted photo as a jpg", () => {
    expect(jpegName("IMG_1234.HEIC")).toBe("IMG_1234.jpg");
  });
  it("gives a mov a QuickTime type when the browser left it blank", () => {
    expect(mimeForVideo({ name: "x.MOV", type: "" })).toBe("video/quicktime");
  });
  it("flags oversize files with plain words", () => {
    expect(sizeProblem("photo", 26 * 1024 * 1024)).toBe("Photo is over 25 MB");
    expect(sizeProblem("video", 3 * 1024 ** 3)).toBe("Video is over 2 GB");
    expect(sizeProblem("photo", 1024)).toBeNull();
  });
});
