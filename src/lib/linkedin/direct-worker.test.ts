import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  piece: {} as Record<string, unknown>,
  account: {} as Record<string, unknown>,
  company: {} as Record<string, unknown>,
  actor: {} as Record<string, unknown>,
  updates: [] as Array<Record<string, unknown>>,
  assets: [] as Array<Record<string, unknown>>,
}));
vi.mock("@/lib/crypto", () => ({ decrypt: () => "access-token" }));
vi.mock("@/lib/linkedin/client", () => ({
  createPost: vi.fn(async () => ({ postUrn: "urn:li:share:post-1", postUrl: "https://www.linkedin.com/feed/update/post-1/" })),
  uploadImage: vi.fn(),
  uploadVideo: vi.fn(),
  addComment: vi.fn(),
}));

import { createPost, uploadImage, uploadVideo } from "@/lib/linkedin/client";
import { processLinkedInDirectJob } from "./direct-worker";

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
      chain.eq = () => chain;
      chain.not = () => chain;
      chain.update = (patch: Record<string, unknown>) => { action = "update"; values = patch; state.updates.push(patch); return chain; };
      chain.maybeSingle = async () => ({ data: table === "content_pieces" ? state.piece : table === "company_social_accounts" ? state.account : table === "companies" ? state.company : state.actor, error: null });
      chain.then = (resolve: (value: unknown) => void) => Promise.resolve(action === "update" ? { data: values, error: null } : { data: table === "content_assets" ? state.assets : [], error: null }).then(resolve);
      return chain;
    },
  };
}

beforeEach(() => {
  vi.mocked(createPost).mockResolvedValue({ postUrn: "urn:li:share:post-1", postUrl: "https://www.linkedin.com/feed/update/post-1/" });
  state.updates = [];
  state.assets = [];
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
    expect(createPost).toHaveBeenCalledWith("access-token", "person-1", "Approved text", undefined);
    expect(state.updates.at(-1)).toMatchObject({ status: "published", external_id: "urn:li:share:post-1" });

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
    expect(uploadImage).toHaveBeenCalledWith("access-token", "person-1", expect.any(Buffer), "linkedin-post-image.png");
    expect(createPost).toHaveBeenCalledWith("access-token", "person-1", "Approved text", "urn:li:image:image-1");
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
      expect(uploadVideo).toHaveBeenCalledWith("access-token", "person-1", Buffer.from([0, 0, 0, 24]), Buffer.from([255, 216]));
      expect(createPost).toHaveBeenCalledWith("access-token", "person-1", "Approved text", "urn:li:video:video-1", "Post");
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
});
