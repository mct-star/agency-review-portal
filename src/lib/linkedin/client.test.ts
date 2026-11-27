import { afterEach, describe, expect, it, vi } from "vitest";
import { addComment, createPost, exchangeCodeForTokens, getAdministeredOrganizations, getProfile, uploadDocument, uploadVideo } from "./client";

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

describe("organisation publishing and member identity without OpenID", () => {
  it("reads the member from /v2/me when the token has no openid scope", async () => {
    const calls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      calls.push(url);
      return json({ id: "mem-1", localizedFirstName: "Michael", localizedLastName: "Colling-Tuck", profilePicture: { "displayImage~": { elements: [{ identifiers: [{ identifier: "https://media.licdn.com/small.jpg" }] }, { identifiers: [{ identifier: "https://media.licdn.com/large.jpg" }] }] } } });
    }));
    const profile = await getProfile("access-token", "r_basicprofile w_member_social");
    expect(calls[0]).toMatch(/^https:\/\/api\.linkedin\.com\/v2\/me\?projection=/);
    expect(profile).toMatchObject({ sub: "mem-1", name: "Michael Colling-Tuck", givenName: "Michael", familyName: "Colling-Tuck", picture: "https://media.licdn.com/large.jpg" });
  });

  it("falls back to the plain member record when LinkedIn refuses the picture projection", async () => {
    const calls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      calls.push(url);
      return url.includes("projection") ? new Response("bad projection", { status: 400 }) : json({ id: "mem-2", localizedFirstName: "Ada", localizedLastName: "Lovelace" });
    }));
    expect(await getProfile("access-token", "r_basicprofile")).toMatchObject({ sub: "mem-2", name: "Ada Lovelace", picture: undefined });
    expect(calls[1]).toBe("https://api.linkedin.com/v2/me");
  });

  it("lists the pages the member administers, with their names", async () => {
    const calls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      calls.push(url);
      if (url.includes("organizationAcls")) return json({ elements: [{ organization: "urn:li:organization:111", role: "ADMINISTRATOR", state: "APPROVED" }, { organization: "urn:li:organization:222", role: "ADMINISTRATOR", state: "APPROVED" }] });
      if (url.endsWith("/rest/organizations/111")) return json({ id: 111, localizedName: "AGENCY", vanityName: "agency-bristol" });
      return new Response("nope", { status: 403 });
    }));
    const pages = await getAdministeredOrganizations("access-token");
    expect(calls[0]).toBe("https://api.linkedin.com/rest/organizationAcls?q=roleAssignee&role=ADMINISTRATOR&state=APPROVED");
    expect(pages).toEqual([
      { id: "111", urn: "urn:li:organization:111", name: "AGENCY", vanityName: "agency-bristol" },
      { id: "222", urn: "urn:li:organization:222", name: "LinkedIn page 222", vanityName: null },
    ]);
  });

  it("posts and comments as the organisation when given its URN", async () => {
    const bodies: Array<{ url: string; body: Record<string, unknown> }> = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
      bodies.push({ url, body: JSON.parse(init.body as string) });
      return new Response(null, { status: 201, headers: { "x-restli-id": url.endsWith("/rest/posts") ? "urn:li:share:9" : "urn:li:comment:1" } });
    }));
    await createPost("access-token", "urn:li:organization:111", "Text", "urn:li:document:D1", "Carousel title");
    await addComment("access-token", "urn:li:share:9", "urn:li:organization:111", "Link in here");
    expect(bodies[0].body).toMatchObject({ author: "urn:li:organization:111", content: { media: { id: "urn:li:document:D1", title: "Carousel title" } } });
    expect(bodies[1].body).toMatchObject({ actor: "urn:li:organization:111", object: "urn:li:share:9", message: { text: "Link in here" } });
  });

  it("records the requested scopes when LinkedIn's token response leaves scope out", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ access_token: "t", expires_in: 60 })));
    expect((await exchangeCodeForTokens("code", "id", "secret", "https://x/cb", "r_basicprofile w_member_social_feed")).scope).toBe("r_basicprofile w_member_social_feed");
  });

  it("keeps a bare member id meaning a person", async () => {
    const bodies: Array<Record<string, unknown>> = [];
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => { bodies.push(JSON.parse(init.body as string)); return new Response(null, { status: 201, headers: { "x-restli-id": "urn:li:share:1" } }); }));
    await createPost("access-token", "person-1", "Text");
    expect(bodies[0].author).toBe("urn:li:person:person-1");
  });

  it("uploads a PDF document for the owner and waits until LinkedIn has processed it", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const responses = [
      json({ value: { uploadUrl: "https://www.linkedin.com/dms-uploads/doc", document: "urn:li:document:D1" } }),
      new Response(null, { status: 201 }),
      json({ status: "PROCESSING" }),
      json({ status: "AVAILABLE" }),
    ];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => { calls.push({ url, init }); return responses.shift()!; }));
    const result = await uploadDocument("access-token", "urn:li:organization:111", Buffer.from("%PDF-1.3"), { pollIntervalMs: 1, maxWaitMs: 1_000 });
    expect(result).toEqual({ documentUrn: "urn:li:document:D1" });
    expect(calls[0].url).toBe("https://api.linkedin.com/rest/documents?action=initializeUpload");
    expect(JSON.parse(calls[0].init.body as string)).toEqual({ initializeUploadRequest: { owner: "urn:li:organization:111" } });
    expect(calls[1].url).toBe("https://www.linkedin.com/dms-uploads/doc");
    expect((calls[1].init.headers as Record<string, string>)["Content-Type"]).toBe("application/pdf");
    expect(calls[3].url).toBe(`https://api.linkedin.com/rest/documents/${encodeURIComponent("urn:li:document:D1")}`);
  });

  it("stops when LinkedIn cannot process the document", async () => {
    const responses = [json({ value: { uploadUrl: "https://up/doc", document: "urn:li:document:D2" } }), new Response(null, { status: 201 }), json({ status: "PROCESSING_FAILED" })];
    vi.stubGlobal("fetch", vi.fn(async () => responses.shift()!));
    await expect(uploadDocument("access-token", "person-1", Buffer.from("%PDF"), { pollIntervalMs: 1, maxWaitMs: 1_000 })).rejects.toThrow("could not process");
  });
});
