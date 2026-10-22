import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  tables: {} as Record<string, Array<Record<string, unknown>>>,
  updates: [] as Array<Record<string, unknown>>,
  failPublishedSave: false,
}));
vi.mock("@/lib/crypto", () => ({ decrypt: () => "private-page-token" }));
vi.mock("@/lib/meta/oauth", async (original) => ({
  ...await original<typeof import("./oauth")>(),
  metaGraph: vi.fn(),
  metaGraphPost: vi.fn(),
}));
import { metaGraph, metaGraphPost, MetaGraphError } from "./oauth";
import { processMetaDirectJob, waitForInstagramContainer } from "./direct-worker";

const imageUrl = "https://meta-test.supabase.co/storage/v1/object/public/media/post.jpg";
const job = {
  id: "job-1", company_id: "company-1", content_piece_id: "piece-1", social_account_id: "account-1", triggered_by: "user-1",
  publish_payload: { provider: "meta-direct-v1", platform: "facebook" as const, caption: "Approved #Launch", image_url: null as string | null },
};

function database() {
  return { from: (table: string) => {
    const filters: Array<[string, unknown]> = [];
    let patch: Record<string, unknown> | null = null;
    const chain: Record<string, any> = {};
    const result = () => {
      const rows = (state.tables[table] || []).filter((row) => filters.every(([key, value]) => row[key] === value));
      if (patch && state.failPublishedSave && patch.status === "published") return { data: null, error: { message: "write failed" } };
      if (patch) rows.forEach((row) => Object.assign(row, patch));
      return { data: rows, error: null };
    };
    chain.select = () => chain;
    chain.not = () => chain;
    chain.eq = (key: string, value: unknown) => { filters.push([key, value]); return chain; };
    chain.update = (value: Record<string, unknown>) => { patch = value; state.updates.push(value); return chain; };
    chain.maybeSingle = async () => { const value = result(); return { ...value, data: value.data?.[0] || null }; };
    chain.then = (resolve: (value: unknown) => void) => Promise.resolve(result()).then(resolve);
    return chain;
  } };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://meta-test.supabase.co");
  state.failPublishedSave = false;
  state.updates = [];
  state.tables = {
    content_pieces: [{ id: "piece-1", company_id: "company-1", approval_status: "approved", content_type: "social_post", markdown_body: "Approved #Launch", cover_image_url: null }],
    company_social_accounts: [{ id: "account-1", company_id: "company-1", platform: "facebook", account_id: "page-1", access_token_encrypted: "ciphertext", token_expires_at: null, is_active: true, platform_metadata: { page_id: "page-1", instagram_id: "ig-1" } }],
    companies: [{ id: "company-1", social_networks: ["facebook", "instagram"], post_pack: "hospitality" }],
    users: [{ id: "user-1", role: "client", company_id: "company-1", can_publish: true }],
    content_images: [], content_assets: [], publishing_jobs: [{ ...job, status: "running" }],
  };
  vi.mocked(metaGraph).mockImplementation(async (path) => path === "me" ? { id: "page-1" }
    : path === "page-1" ? { instagram_business_account: { id: "ig-1" } }
    : path === "container-1" ? { status_code: "FINISHED" }
    : { permalink_url: "https://www.facebook.com/page/posts/post", permalink: "https://www.instagram.com/p/post/" });
  vi.mocked(metaGraphPost).mockImplementation(async (path) => path.endsWith("/media") ? { id: "container-1" }
    : path.endsWith("/media_publish") ? { id: "ig-post-1" }
    : path.endsWith("/photos") ? { id: "photo-1", post_id: "page-1_post-1" } : { id: "page-1_post-1" });
  vi.stubGlobal("fetch", vi.fn(async () => new Response(new Uint8Array([255, 216, 255]), { headers: { "content-type": "image/jpeg" } })));
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("Meta dispatch guards", () => {
  it("publishes the approved snapshot to the exact Facebook Page for a hospitality company", async () => {
    expect(await processMetaDirectJob(database() as never, job)).toBe("published");
    expect(metaGraphPost).toHaveBeenCalledWith("page-1/feed", { message: "Approved #Launch" }, "private-page-token");
    expect(state.updates.at(-1)).toMatchObject({ status: "published", external_id: "page-1_post-1" });
  });

  const cases: Array<[string, () => void]> = [
    ["withdrawn approval", () => { state.tables.content_pieces[0].approval_status = "pending"; }],
    ["changed copy", () => { state.tables.content_pieces[0].markdown_body = "Changed copy"; }],
    ["a moved post", () => { state.tables.content_pieces[0].company_id = "other-company"; }],
    ["revoked publishing permission", () => { state.tables.users[0].can_publish = false; }],
    ["a moved publisher", () => { state.tables.users[0].company_id = "other-company"; }],
    ["a disconnected account", () => { state.tables.company_social_accounts[0].is_active = false; }],
    ["an account from another company", () => { state.tables.company_social_accounts[0].company_id = "other-company"; }],
    ["a disabled network", () => { state.tables.companies[0].social_networks = []; }],
    ["an expired token", () => { state.tables.company_social_accounts[0].token_expires_at = "2020-01-01T00:00:00Z"; }],
    ["an invalid token expiry", () => { state.tables.company_social_accounts[0].token_expires_at = "invalid"; }],
    ["changed media", () => { state.tables.content_pieces[0].cover_image_url = imageUrl; }],
  ];
  it.each(cases)("refuses %s before sending anything to Meta", async (_label, change) => {
    change();
    expect(await processMetaDirectJob(database() as never, job)).toBe("failed");
    expect(metaGraphPost).not.toHaveBeenCalled();
    expect(state.updates.at(-1)).toMatchObject({ response_payload: { outcome_uncertain: false } });
  });

  it("rejects a token identifying a different Page", async () => {
    vi.mocked(metaGraph).mockResolvedValue({ id: "other-page" });
    expect(await processMetaDirectJob(database() as never, job)).toBe("failed");
    expect(metaGraphPost).not.toHaveBeenCalled();
  });

  it("records an uncertain result if the final publish has no ID", async () => {
    vi.mocked(metaGraphPost).mockResolvedValue({});
    expect(await processMetaDirectJob(database() as never, job)).toBe("failed");
    expect(state.updates.at(-1)).toMatchObject({ response_payload: { outcome_uncertain: true, manual_check_required: true } });
    expect(metaGraphPost).toHaveBeenCalledTimes(1);
  });

  it("retains a confirmed publication when the permalink lookup fails", async () => {
    vi.mocked(metaGraph).mockResolvedValueOnce({ id: "page-1" }).mockRejectedValueOnce(new Error("permalink unavailable"));
    expect(await processMetaDirectJob(database() as never, job)).toBe("published");
    expect(state.updates.at(-1)).toMatchObject({ status: "published", external_id: "page-1_post-1", external_url: null });
  });

  it("requires manual checking if saving a confirmed publication fails", async () => {
    state.failPublishedSave = true;
    expect(await processMetaDirectJob(database() as never, job)).toBe("failed");
    expect(state.updates.at(-1)).toMatchObject({ response_payload: { outcome_uncertain: true, manual_check_required: true } });
    expect(metaGraphPost).toHaveBeenCalledTimes(1);
  });

  it("treats a provider rejection as a known failure", async () => {
    vi.mocked(metaGraphPost).mockRejectedValue(new MetaGraphError(400, false));
    expect(await processMetaDirectJob(database() as never, job)).toBe("failed");
    expect(state.updates.at(-1)).toMatchObject({ response_payload: { outcome_uncertain: false } });
  });

  it("uses the returned Facebook post ID for a photo post", async () => {
    state.tables.content_pieces[0].cover_image_url = imageUrl;
    expect(await processMetaDirectJob(database() as never, { ...job, publish_payload: { ...job.publish_payload, image_url: imageUrl } })).toBe("published");
    expect(state.updates.at(-1)).toMatchObject({ external_id: "page-1_post-1" });
    expect(fetch).toHaveBeenCalledWith(imageUrl, expect.objectContaining({ redirect: "error", signal: expect.any(AbortSignal) }));
  });

  it("waits for a photo container before publishing to the linked Instagram account", async () => {
    state.tables.content_pieces[0].cover_image_url = imageUrl;
    Object.assign(state.tables.company_social_accounts[0], { platform: "instagram", account_id: "ig-1" });
    const instagramJob = { ...job, publish_payload: { ...job.publish_payload, platform: "instagram" as const, image_url: imageUrl } };
    expect(await processMetaDirectJob(database() as never, instagramJob)).toBe("published");
    expect(metaGraphPost).toHaveBeenNthCalledWith(1, "ig-1/media", { image_url: imageUrl, caption: "Approved #Launch" }, "private-page-token");
    expect(metaGraphPost).toHaveBeenNthCalledWith(2, "ig-1/media_publish", { creation_id: "container-1" }, "private-page-token");
    expect(state.updates.at(-1)).toMatchObject({ external_id: "ig-post-1", external_url: "https://www.instagram.com/p/post/" });
  });
});

describe("Instagram container readiness", () => {
  it("waits for FINISHED before publishing and stops on provider failure", async () => {
    const read = vi.fn().mockResolvedValueOnce({ status_code: "IN_PROGRESS" }).mockResolvedValueOnce({ status_code: "FINISHED" });
    const pause = vi.fn().mockResolvedValue(undefined);
    await expect(waitForInstagramContainer("container", "token", read, pause)).resolves.toBeUndefined();
    expect(read).toHaveBeenCalledTimes(2);
    expect(pause).toHaveBeenCalledTimes(1);
    await expect(waitForInstagramContainer("container", "token", vi.fn().mockResolvedValue({ status_code: "ERROR" }), pause)).rejects.toThrow("could not prepare");
  });

  it("bounds readiness checks when Meta stays in progress", async () => {
    const read = vi.fn().mockResolvedValue({ status_code: "IN_PROGRESS" });
    await expect(waitForInstagramContainer("container", "token", read, vi.fn().mockResolvedValue(undefined))).rejects.toThrow("still processing");
    expect(read).toHaveBeenCalledTimes(4);
  });
});
