import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  piece: {} as Record<string, unknown>,
  account: {} as Record<string, unknown>,
  company: {} as Record<string, unknown>,
  actor: {} as Record<string, unknown>,
  pages: [] as Array<Record<string, unknown>>,
  updates: [] as Array<Record<string, unknown>>,
  assets: [] as Array<Record<string, unknown>>,
  mentions: [] as Array<Record<string, unknown>>,
  filters: [] as Array<[string, string, unknown]>,
}));
vi.mock("@/lib/crypto", () => ({ decrypt: () => "access-token" }));
vi.mock("@/lib/linkedin/client", () => ({
  createPost: vi.fn(async () => ({ postUrn: "urn:li:share:post-1", postUrl: "https://www.linkedin.com/feed/update/post-1/" })),
  uploadImage: vi.fn(),
  uploadVideo: vi.fn(),
  uploadDocument: vi.fn(),
  addComment: vi.fn(),
}));
vi.mock("@/lib/linkedin/images-pdf", () => ({ imagesToPdf: vi.fn(async (images: Buffer[]) => Buffer.from(`%PDF pages=${images.length}`)) }));

import { addComment, createPost, uploadDocument, uploadImage, uploadVideo } from "@/lib/linkedin/client";
import { imagesToPdf } from "@/lib/linkedin/images-pdf";
import { processLinkedInDirectJob } from "./direct-worker";
import { escapeLittleText, toLinkedInText } from "./post-text";

const job = {
  id: "job-1", company_id: "company-1", content_piece_id: "piece-1", social_account_id: "account-1", triggered_by: "user-1",
  publish_payload: { provider: "linkedin-direct-v1", commentary: "Approved text", image_urls: [], first_comment: null },
};

function fakeSupabase() {
  return {
    from: (table: string) => {
      let action: "select" | "update" = "select";
      let values: Record<string, unknown> = {};
      const chain: Record<string, any> = {};
      chain.select = () => chain;
      chain.eq = (key: string, value: unknown) => { state.filters.push([table, key, value]); return chain; };
      chain.not = () => chain;
      chain.update = (patch: Record<string, unknown>) => { action = "update"; values = patch; state.updates.push(patch); return chain; };
      chain.maybeSingle = async () => ({ data: table === "content_pieces" ? state.piece : table === "company_social_accounts" ? state.account : table === "companies" ? state.company : state.actor, error: null });
      chain.then = (resolve: (value: unknown) => void) => Promise.resolve(action === "update" ? { data: values, error: null } : { data: table === "content_assets" ? state.assets : table === "linkedin_mentions" ? state.mentions : table === "company_social_accounts" ? state.pages : [], error: null }).then(resolve);
      return chain;
    },
  };
}

beforeEach(() => {
  vi.mocked(createPost).mockResolvedValue({ postUrn: "urn:li:share:post-1", postUrl: "https://www.linkedin.com/feed/update/post-1/" });
  state.updates = [];
  state.assets = [];
  state.mentions = [];
  state.filters = [];
  vi.mocked(addComment).mockReset().mockResolvedValue({ commentUrn: "urn:li:comment:1" });
  state.piece = { id: "piece-1", company_id: "company-1", approval_status: "approved", content_type: "social_post", markdown_body: "Approved text", first_comment: null, title: "Post", cover_image_url: null };
  state.account = { id: "account-1", company_id: "company-1", account_id: "person-1", access_token_encrypted: "cipher", token_expires_at: new Date(Date.now() + 60_000).toISOString(), is_active: true };
  state.company = { post_pack: "b2b", social_networks: [] };
  state.actor = { id: "user-1", role: "client", company_id: "company-1", can_publish: true };
});

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("processLinkedInDirectJob", () => {
  it("publishes the approved snapshot to the selected account", async () => {
    const supabase = fakeSupabase() as never;
    expect(await processLinkedInDirectJob(supabase, job)).toBe("published");
    expect(createPost).toHaveBeenCalledWith("access-token", "urn:li:person:person-1", "Approved text", undefined);
    expect(state.updates.at(-1)).toMatchObject({ status: "published", external_id: "urn:li:share:post-1" });

  });

  it("converts a listed ＠name to mention markup only at publish time, and leaves an unlisted name as plain text", async () => {
    state.piece.markdown_body = "Thanks ＠Jane Smith and ＠Nobody Known";
    state.mentions = [{ name: "Jane Smith", urn: "urn:li:person:abc123", kind: "person" }];
    // The queued payload is the approved text, escaped, with no markup in it.
    const queued = { ...job, publish_payload: { ...job.publish_payload, commentary: "Thanks ＠Jane Smith and ＠Nobody Known" } };
    expect(await processLinkedInDirectJob(fakeSupabase() as never, queued)).toBe("published");
    expect(createPost).toHaveBeenCalledWith("access-token", "urn:li:person:person-1", "Thanks @[Jane Smith](urn:li:person:abc123) and ＠Nobody Known", undefined);
  });

  describe("uploaded PDF document posts", () => {
    const url = "https://publishing-test.supabase.co/storage/v1/object/public/media/guide.pdf";
    const withPdf = { ...job, publish_payload: { ...job.publish_payload, document_url: url, document_title: "The guide" } };
    beforeEach(() => {
      vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://publishing-test.supabase.co");
      state.assets = [{ asset_type: "pdf_file", file_url: url, text_content: "", asset_metadata: {} }];
      vi.mocked(createPost).mockClear();
      vi.mocked(uploadDocument).mockReset().mockResolvedValue({ documentUrn: "urn:li:document:doc-1" });
    });

    it("uploads the PDF through the Documents API and posts it with the document title", async () => {
      vi.stubGlobal("fetch", vi.fn(async () => new Response(Buffer.from("%PDF-1.4\n<< /Type /Page >>"), { headers: { "Content-Type": "application/pdf" } })));
      expect(await processLinkedInDirectJob(fakeSupabase() as never, withPdf)).toBe("published");
      expect(uploadDocument).toHaveBeenCalledWith("access-token", "urn:li:person:person-1", expect.any(Buffer));
      expect(createPost).toHaveBeenCalledWith("access-token", "urn:li:person:person-1", "Approved text", "urn:li:document:doc-1", "The guide");
    });

    it("refuses a file that is not a PDF before LinkedIn sees anything", async () => {
      vi.stubGlobal("fetch", vi.fn(async () => new Response("<html></html>", { headers: { "Content-Type": "text/html" } })));
      expect(await processLinkedInDirectJob(fakeSupabase() as never, withPdf)).toBe("failed");
      expect(uploadDocument).not.toHaveBeenCalled();
      expect(createPost).not.toHaveBeenCalled();
      expect(state.updates.at(-1)).toMatchObject({ status: "failed", error_message: expect.stringMatching(/PDF/) });
    });
  });

  const withdrawnCases: Array<[string, () => void]> = [
    ["withdrawn approval", () => { state.piece.approval_status = "pending"; }],
    ["changed text", () => { state.piece.markdown_body = "Changed after queueing"; }],
    ["changed first comment", () => { state.piece.first_comment = "New comment"; }],
    ["revoked publishing rights", () => { state.actor.can_publish = false; }],
    ["an actor moved to another company", () => { state.actor.company_id = "company-2"; }],
    ["a removed LinkedIn destination", () => { state.company.social_networks = ["facebook"]; }],
  ];
  it.each(withdrawnCases)("refuses %s before contacting LinkedIn", async (_name, withdraw) => {
    withdraw();
    expect(await processLinkedInDirectJob(fakeSupabase() as never, job)).toBe("failed");
    expect(createPost).not.toHaveBeenCalled();
    expect(state.updates.at(-1)).toMatchObject({ status: "failed", response_payload: { outcome_uncertain: false } });
  });

  it("records an uncertain outcome when LinkedIn returns no usable post ID", async () => {
    vi.mocked(createPost).mockResolvedValue({ postUrn: "urn:li:share:", postUrl: "" });
    const result = await processLinkedInDirectJob(fakeSupabase() as never, job);
    expect(result).toBe("uncertain");
    expect(state.updates.at(-1)).toMatchObject({ status: "failed", response_payload: { outcome_uncertain: true, manual_check_required: true } });
  });

  it("uploads the approved PNG with its media type and refuses redirects", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://publishing-test.supabase.co");
    const url = "https://publishing-test.supabase.co/storage/v1/object/public/media/post.png";
    state.piece.cover_image_url = url;
    const fetchImage = vi.fn(async () => new Response(new Uint8Array([137, 80, 78, 71]), { headers: { "Content-Type": "image/png" } }));
    vi.stubGlobal("fetch", fetchImage);
    vi.mocked(uploadImage).mockResolvedValue({ imageUrn: "urn:li:image:image-1" });
    const withImage = { ...job, publish_payload: { ...job.publish_payload, image_urls: [url] } };
    expect(await processLinkedInDirectJob(fakeSupabase() as never, withImage)).toBe("published");
    expect(fetchImage).toHaveBeenCalledWith(url, expect.objectContaining({ redirect: "error", signal: expect.any(AbortSignal) }));
    expect(uploadImage).toHaveBeenCalledWith("access-token", "urn:li:person:person-1", expect.any(Buffer), "linkedin-post-image.png");
    expect(createPost).toHaveBeenCalledWith("access-token", "urn:li:person:person-1", "Approved text", "urn:li:image:image-1");
  });

  describe("video posts", () => {
    const url = "https://publishing-test.supabase.co/storage/v1/object/public/media/film.mp4";
    const thumbnail = url.replace("film.mp4", "still.jpg");
    const withVideo = { ...job, publish_payload: { ...job.publish_payload, video_url: url, thumbnail_url: thumbnail } };
    const videoAsset = (fileUrl: string, thumbnailUrl?: string) => ({ asset_type: "custom", file_url: fileUrl, text_content: "Film", asset_metadata: { type: "rendered_video", thumbnailUrl } });
    /** Serves the thumbnail and the video by address, each with its own media type. */
    const serve = (videoType = "video/mp4", thumbnailType = "image/jpeg") => vi.fn(async (address: string) => address === thumbnail
      ? new Response(new Uint8Array([255, 216]), { headers: { "Content-Type": thumbnailType } })
      : new Response(new Uint8Array([0, 0, 0, 24]), { headers: { "Content-Type": videoType } }));
    beforeEach(() => {
      vi.mocked(createPost).mockClear();
      vi.mocked(uploadVideo).mockReset().mockResolvedValue({ videoUrn: "urn:li:video:video-1" });
      vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://publishing-test.supabase.co");
      state.assets = [videoAsset(url, thumbnail)];
    });

    it("uploads the approved MP4 with its thumbnail and posts it with the piece title", async () => {
      const fetchMedia = serve();
      vi.stubGlobal("fetch", fetchMedia);
      expect(await processLinkedInDirectJob(fakeSupabase() as never, withVideo)).toBe("published");
      expect(fetchMedia).toHaveBeenCalledWith(url, expect.objectContaining({ redirect: "error" }));
      expect(fetchMedia).toHaveBeenCalledWith(thumbnail, expect.objectContaining({ redirect: "error" }));
      expect(uploadVideo).toHaveBeenCalledWith("access-token", "urn:li:person:person-1", Buffer.from([0, 0, 0, 24]), Buffer.from([255, 216]));
      expect(createPost).toHaveBeenCalledWith("access-token", "urn:li:person:person-1", "Approved text", "urn:li:video:video-1", "Post");
    });

    it("refuses a non-MP4 file and a video swapped after queueing, before posting", async () => {
      vi.stubGlobal("fetch", serve("video/quicktime"));
      expect(await processLinkedInDirectJob(fakeSupabase() as never, withVideo)).toBe("failed");
      state.assets = [videoAsset(url.replace("film", "other"), thumbnail)];
      expect(await processLinkedInDirectJob(fakeSupabase() as never, withVideo)).toBe("failed");
      expect(uploadVideo).not.toHaveBeenCalled();
      expect(createPost).not.toHaveBeenCalled();
    });

    const thumbnailCases: Array<[string, () => void]> = [
      ["removed", () => { state.assets = [videoAsset(url)]; }],
      ["swapped", () => { state.assets = [videoAsset(url, thumbnail.replace("still", "other"))]; }],
      ["in a format LinkedIn may not take", () => { vi.stubGlobal("fetch", serve("video/mp4", "image/webp")); }],
    ];
    it.each(thumbnailCases)("refuses a thumbnail %s after queueing, before contacting LinkedIn", async (_name, change) => {
      vi.stubGlobal("fetch", serve());
      change();
      expect(await processLinkedInDirectJob(fakeSupabase() as never, withVideo)).toBe("failed");
      expect(uploadVideo).not.toHaveBeenCalled();
      expect(createPost).not.toHaveBeenCalled();
    });

    it("refuses a job queued without a thumbnail", async () => {
      vi.stubGlobal("fetch", serve());
      state.assets = [videoAsset(url)];
      const noThumbnail = { ...job, publish_payload: { ...job.publish_payload, video_url: url } };
      expect(await processLinkedInDirectJob(fakeSupabase() as never, noThumbnail)).toBe("failed");
      expect(uploadVideo).not.toHaveBeenCalled();
    });

    it("treats a failed upload as a definite failure, since nothing was posted", async () => {
      vi.stubGlobal("fetch", serve());
      vi.mocked(uploadVideo).mockRejectedValue(new Error("LinkedIn video upload failed (500): busy"));
      expect(await processLinkedInDirectJob(fakeSupabase() as never, withVideo)).toBe("failed");
      expect(state.updates.at(-1)).toMatchObject({ status: "failed", response_payload: { outcome_uncertain: false } });
    });
  });

  it("fails closed when a token expiry is missing or invalid", async () => {
    state.account = { ...state.account, token_expires_at: "not-a-date" };
    expect(await processLinkedInDirectJob(fakeSupabase() as never, job)).toBe("failed");
    expect(createPost).not.toHaveBeenCalled();
  });

  describe("company page posts", () => {
    const pageJob = { ...job, target_platform: "linkedin_company", publish_payload: { ...job.publish_payload, first_comment: "Read it here: https://agencybristol.com" } };
    beforeEach(() => {
      vi.mocked(createPost).mockClear();
      state.piece = { ...state.piece, post_type: "agency_product_story", first_comment: "Read it here: https://agencybristol.com" };
      state.account = { ...state.account, id: "account-1", platform: "linkedin_company", account_id: "111", platform_metadata: { scope: "r_basicprofile w_organization_social w_organization_social_feed rw_organization_admin", default_page: true } };
      state.pages = [{ id: "account-1", account_name: "AGENCY", is_active: true, platform_metadata: { default_page: true } }, { id: "page-2", account_name: "Rebus MedicoLegal", is_active: true, platform_metadata: {} }];
    });

    it("refuses a page that is neither the default nor confirmed, before contacting LinkedIn", async () => {
      state.account = { ...state.account, id: "page-2", account_id: "222", platform_metadata: { scope: "r_basicprofile w_organization_social w_organization_social_feed rw_organization_admin" } };
      expect(await processLinkedInDirectJob(fakeSupabase() as never, { ...pageJob, social_account_id: "page-2" })).toBe("failed");
      expect(createPost).not.toHaveBeenCalled();
      expect(String(state.updates.at(-1)?.error_message)).toMatch(/default LinkedIn page/i);
    });

    it("refuses when the default changed after queueing, even for a page that used to be the default", async () => {
      state.pages = [{ id: "account-1", account_name: "AGENCY", is_active: true, platform_metadata: {} }, { id: "page-2", account_name: "Rebus MedicoLegal", is_active: true, platform_metadata: { default_page: true } }];
      expect(await processLinkedInDirectJob(fakeSupabase() as never, pageJob)).toBe("failed");
      expect(createPost).not.toHaveBeenCalled();
    });

    it("posts to a non-default page the job confirmed", async () => {
      state.account = { ...state.account, id: "page-2", account_id: "222", platform_metadata: { scope: "r_basicprofile w_organization_social w_organization_social_feed rw_organization_admin" } };
      const confirmed = { ...pageJob, social_account_id: "page-2", publish_payload: { ...pageJob.publish_payload, confirmed_non_default_page: "page-2" } };
      expect(await processLinkedInDirectJob(fakeSupabase() as never, confirmed)).toBe("published");
      expect(createPost).toHaveBeenCalledWith("access-token", "urn:li:organization:222", "Approved text", undefined);
    });

    it("refuses a confirmation recorded for a different page", async () => {
      state.account = { ...state.account, id: "page-2", account_id: "222" };
      const wrong = { ...pageJob, social_account_id: "page-2", publish_payload: { ...pageJob.publish_payload, confirmed_non_default_page: "account-1" } };
      expect(await processLinkedInDirectJob(fakeSupabase() as never, wrong)).toBe("failed");
      expect(createPost).not.toHaveBeenCalled();
    });

    it("posts as the organisation and adds the first comment as the organisation", async () => {
      expect(await processLinkedInDirectJob(fakeSupabase() as never, pageJob)).toBe("published");
      expect(state.filters).toContainEqual(["company_social_accounts", "platform", "linkedin_company"]);
      expect(createPost).toHaveBeenCalledWith("access-token", "urn:li:organization:111", "Approved text", undefined);
      expect(addComment).toHaveBeenCalledWith("access-token", "urn:li:share:post-1", "urn:li:organization:111", "Read it here: https://agencybristol.com");
      expect(state.updates.at(-1)).toMatchObject({ status: "published", error_message: null });
    });

    it("refuses before posting when the grant cannot add the first comment", async () => {
      state.account = { ...state.account, platform_metadata: { scope: "r_basicprofile w_organization_social rw_organization_admin" } };
      expect(await processLinkedInDirectJob(fakeSupabase() as never, pageJob)).toBe("failed");
      expect(createPost).not.toHaveBeenCalled();
      expect(String(state.updates.at(-1)?.error_message)).toContain("first comment");
    });

    it("refuses a spokesperson piece sent to the company page, before contacting LinkedIn", async () => {
      state.piece = { ...state.piece, post_type: "problem_diagnosis" };
      expect(await processLinkedInDirectJob(fakeSupabase() as never, pageJob)).toBe("failed");
      expect(createPost).not.toHaveBeenCalled();
    });

    it("reports a failed first comment loudly on the published job", async () => {
      vi.mocked(addComment).mockRejectedValue(new Error("LinkedIn comment failed (403): ACCESS_DENIED"));
      expect(await processLinkedInDirectJob(fakeSupabase() as never, pageJob)).toBe("published");
      const update = state.updates.at(-1)!;
      expect(update).toMatchObject({ status: "published", response_payload: { comment_failed: true, comment_status: 403, manual_check_required: true } });
      expect(String(update.error_message)).toContain("first comment was not added");
      expect(String(update.error_message)).toContain("403");
    });
  });

  it("refuses a company page piece sent to a personal profile", async () => {
    state.piece = { ...state.piece, post_type: "agency_product_story" };
    expect(await processLinkedInDirectJob(fakeSupabase() as never, job)).toBe("failed");
    expect(createPost).not.toHaveBeenCalled();
  });

  it("posts several images as one PDF document titled from the first line", async () => {
    vi.mocked(createPost).mockClear();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://publishing-test.supabase.co");
    const urls = ["1.png", "2.png", "3.png"].map((name) => `https://publishing-test.supabase.co/storage/v1/object/public/media/${name}`);
    state.piece.markdown_body = "Five handoffs that lose a launch\n\nSwipe through.";
    const commentary = escapeLittleText(toLinkedInText(state.piece.markdown_body as string)).trim();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new Uint8Array([137, 80, 78, 71]), { headers: { "Content-Type": "image/png" } })));
    vi.mocked(uploadDocument).mockResolvedValue({ documentUrn: "urn:li:document:D1" });
    const imagesJob = { ...job, publish_payload: { ...job.publish_payload, commentary, image_urls: urls } };
    const images = urls.map((public_url, sort_order) => ({ public_url, sort_order }));
    const supabase = fakeSupabase() as unknown as { from: (t: string) => Record<string, any> };
    const from = supabase.from;
    supabase.from = (table: string) => {
      const chain = from(table);
      if (table === "content_images") chain.then = (resolve: (value: unknown) => void) => Promise.resolve({ data: images, error: null }).then(resolve);
      return chain;
    };
    expect(await processLinkedInDirectJob(supabase as never, imagesJob)).toBe("published");
    expect(imagesToPdf).toHaveBeenCalledWith([expect.any(Buffer), expect.any(Buffer), expect.any(Buffer)]);
    expect(uploadDocument).toHaveBeenCalledWith("access-token", "urn:li:person:person-1", Buffer.from("%PDF pages=3"));
    expect(createPost).toHaveBeenCalledWith("access-token", "urn:li:person:person-1", commentary, "urn:li:document:D1", "Five handoffs that lose a launch");
    expect(uploadImage).not.toHaveBeenCalled();
  });
});
