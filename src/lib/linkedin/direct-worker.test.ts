import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  piece: {} as Record<string, unknown>,
  account: {} as Record<string, unknown>,
  company: {} as Record<string, unknown>,
  actor: {} as Record<string, unknown>,
  updates: [] as Array<Record<string, unknown>>,
}));
vi.mock("@/lib/crypto", () => ({ decrypt: () => "access-token" }));
vi.mock("@/lib/linkedin/client", () => ({
  createPost: vi.fn(async () => ({ postUrn: "urn:li:share:post-1", postUrl: "https://www.linkedin.com/feed/update/post-1/" })),
  uploadImage: vi.fn(),
  addComment: vi.fn(),
}));

import { createPost, uploadImage } from "@/lib/linkedin/client";
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
      chain.then = (resolve: (value: unknown) => void) => Promise.resolve(action === "update" ? { data: values, error: null } : { data: [], error: null }).then(resolve);
      return chain;
    },
  };
}

beforeEach(() => {
  vi.mocked(createPost).mockResolvedValue({ postUrn: "urn:li:share:post-1", postUrl: "https://www.linkedin.com/feed/update/post-1/" });
  state.updates = [];
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

  it("fails closed when a token expiry is missing or invalid", async () => {
    state.account = { ...state.account, token_expires_at: "not-a-date" };
    expect(await processLinkedInDirectJob(fakeSupabase() as never, job)).toBe("failed");
    expect(createPost).not.toHaveBeenCalled();
  });
});
