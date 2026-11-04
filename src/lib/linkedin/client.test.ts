import { afterEach, describe, expect, it, vi } from "vitest";
import { createPost, uploadVideo } from "./client";

const VIDEO_URN = "urn:li:video:C5F10AQGKQg_6y2a4sQ";

function json(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" }, ...init });
}

const THUMBNAIL_UPLOAD_URL = "https://www.linkedin.com/dms-uploads/thumbnail";
const THUMBNAIL = Buffer.from([9, 8, 7]);

function initResponse() {
  return json({
    value: {
      video: VIDEO_URN,
      uploadToken: "token-1",
      thumbnailUploadUrl: THUMBNAIL_UPLOAD_URL,
      uploadInstructions: [
        { uploadUrl: "https://www.linkedin.com/dms-uploads/part-1", firstByte: 0, lastByte: 3 },
        { uploadUrl: "https://www.linkedin.com/dms-uploads/part-2", firstByte: 4, lastByte: 5 },
      ],
    },
  });
}

afterEach(() => { vi.unstubAllGlobals(); });

describe("uploadVideo", () => {
  it("uploads each byte range and the thumbnail, finalizes with the part IDs in order and waits until AVAILABLE", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const responses = [
      initResponse(),
      new Response(null, { status: 200, headers: { etag: "etag-1" } }),
      new Response(null, { status: 200, headers: { etag: "etag-2" } }),
      new Response(null, { status: 201 }),
      new Response(null, { status: 200 }),
      json({ status: "PROCESSING" }),
      json({ status: "AVAILABLE" }),
    ];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => { calls.push({ url, init }); return responses.shift()!; }));

    const result = await uploadVideo("access-token", "person-1", Buffer.from([1, 2, 3, 4, 5, 6]), THUMBNAIL, { pollIntervalMs: 1, maxWaitMs: 1_000 });

    expect(result).toEqual({ videoUrn: VIDEO_URN });
    expect(calls[0].url).toBe("https://api.linkedin.com/rest/videos?action=initializeUpload");
    expect(JSON.parse(calls[0].init.body as string)).toEqual({
      initializeUploadRequest: { owner: "urn:li:person:person-1", fileSizeBytes: 6, uploadCaptions: false, uploadThumbnail: true },
    });
    expect(Array.from(calls[1].init.body as Uint8Array)).toEqual([1, 2, 3, 4]);
    expect(Array.from(calls[2].init.body as Uint8Array)).toEqual([5, 6]);
    expect(calls[1].init.headers).not.toHaveProperty("Authorization");
    expect(calls[3].url).toBe(THUMBNAIL_UPLOAD_URL);
    expect(calls[3].init.method).toBe("PUT");
    expect(calls[3].init.headers).toEqual({ "Content-Type": "application/octet-stream", "media-type-family": "STILLIMAGE" });
    expect(Array.from(calls[3].init.body as Uint8Array)).toEqual([9, 8, 7]);
    expect(calls[4].url).toBe("https://api.linkedin.com/rest/videos?action=finalizeUpload");
    expect(JSON.parse(calls[4].init.body as string)).toEqual({
      finalizeUploadRequest: { video: VIDEO_URN, uploadToken: "token-1", uploadedPartIds: ["etag-1", "etag-2"] },
    });
    expect(calls[5].url).toBe(`https://api.linkedin.com/rest/videos/${encodeURIComponent(VIDEO_URN)}`);
    expect(calls).toHaveLength(7);
  });

  it("stops before finalizing when the thumbnail is rejected", async () => {
    const fetchMock = vi.fn();
    [initResponse(), new Response(null, { headers: { etag: "a" } }), new Response(null, { headers: { etag: "b" } }), new Response("denied", { status: 403 })]
      .forEach((response) => fetchMock.mockResolvedValueOnce(response));
    vi.stubGlobal("fetch", fetchMock);
    await expect(uploadVideo("t", "p", Buffer.from([1, 2, 3, 4, 5, 6]), THUMBNAIL)).rejects.toThrow("LinkedIn video thumbnail upload failed (403)");
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("refuses to upload a video LinkedIn gave no thumbnail URL for", async () => {
    const fetchMock = vi.fn(async () => json({ value: { video: VIDEO_URN, uploadInstructions: [{ uploadUrl: "https://www.linkedin.com/dms-uploads/part-1", firstByte: 0, lastByte: 5 }] } }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(uploadVideo("t", "p", Buffer.from([1, 2, 3, 4, 5, 6]), THUMBNAIL)).rejects.toThrow("no thumbnail upload URL");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("names the HTTP status when a part upload is rejected", async () => {
    const responses = [initResponse(), new Response("denied", { status: 403 })];
    vi.stubGlobal("fetch", vi.fn(async () => responses.shift()!));
    await expect(uploadVideo("access-token", "person-1", Buffer.from([1, 2, 3, 4, 5, 6]), THUMBNAIL)).rejects.toThrow("LinkedIn video upload failed (403)");
  });

  it("fails when LinkedIn cannot process the video or the wait runs out", async () => {
    const parts = () => [new Response(null, { headers: { etag: "a" } }), new Response(null, { headers: { etag: "b" } }), new Response(null, { status: 201 }), new Response(null)];
    let responses = [initResponse(), ...parts(), json({ status: "PROCESSING_FAILED" })];
    vi.stubGlobal("fetch", vi.fn(async () => responses.shift()!));
    await expect(uploadVideo("t", "p", Buffer.from([1, 2, 3, 4, 5, 6]), THUMBNAIL, { pollIntervalMs: 1 })).rejects.toThrow("could not process");

    responses = [initResponse(), ...parts(), json({ status: "PROCESSING" })];
    await expect(uploadVideo("t", "p", Buffer.from([1, 2, 3, 4, 5, 6]), THUMBNAIL, { pollIntervalMs: 10, maxWaitMs: 0 })).rejects.toThrow("still processing");
  });

  it("refuses an initialize response without upload instructions", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ value: { video: VIDEO_URN, uploadInstructions: [] } })));
    await expect(uploadVideo("t", "p", Buffer.from([1]), THUMBNAIL)).rejects.toThrow("no upload instructions");
  });
});

describe("createPost", () => {
  it("attaches a video URN with its title", async () => {
    const fetchPost = vi.fn(async () => new Response(null, { status: 201, headers: { "x-restli-id": "urn:li:share:post-1" } }));
    vi.stubGlobal("fetch", fetchPost);
    const posted = await createPost("access-token", "person-1", "Watch this", VIDEO_URN, "The film");
    expect(posted.postUrn).toBe("urn:li:share:post-1");
    const body = JSON.parse((fetchPost.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(body.content).toEqual({ media: { title: "The film", id: VIDEO_URN } });
  });
});
