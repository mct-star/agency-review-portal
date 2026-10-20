import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DirectSocialAdapter } from "./direct-social";
import { processDirectSocialJob, type DirectSocialJob } from "./direct-social-worker";

vi.mock("@/lib/crypto", () => ({ decrypt: (value: string) => value.replace(/^enc:/, ""), encrypt: (value: string) => `enc:${value}` }));
const state = { tables: {} as Record<string, Array<Record<string, unknown>>>, failPublishedSave: false };
const job: DirectSocialJob = { id: "job", company_id: "company", content_piece_id: "piece", social_account_id: "account", triggered_by: "publisher", target_platform: "twitter", publish_payload: { provider: "direct-social-v1", platform: "twitter", account_id: "x-user", text: "Approved post", title: "Approved title", media: null, options: {} } };

function database() {
  return { from(table: string) {
    const filters: Array<[string, unknown]> = [];
    let patch: Record<string, unknown> | null = null;
    const result = () => {
      const rows = (state.tables[table] || []).filter((row) => filters.every(([key, value]) => row[key] === value));
      if (patch?.status === "published" && state.failPublishedSave) return { data: null, error: { message: "save failed" } };
      if (patch) rows.forEach((row) => Object.assign(row, patch));
      return { data: rows, error: null };
    };
    const chain: Record<string, any> = {};
    chain.select = chain.not = () => chain;
    chain.eq = (key: string, value: unknown) => { filters.push([key, value]); return chain; };
    chain.update = (value: Record<string, unknown>) => { patch = value; return chain; };
    chain.maybeSingle = async () => { const r = result(); return { ...r, data: r.data?.[0] || null }; };
    chain.then = (resolve: (value: unknown) => void) => Promise.resolve(result()).then(resolve);
    return chain;
  } };
}
const adapter: DirectSocialAdapter = { refreshIfNeeded: vi.fn(), publish: vi.fn() };
const run = () => processDirectSocialJob(database() as never, structuredClone(job), () => adapter);

beforeEach(() => {
  vi.clearAllMocks();
  state.failPublishedSave = false;
  state.tables = {
    content_pieces: [{ id: "piece", company_id: "company", approval_status: "approved", content_type: "social_post", markdown_body: "Approved post", title: "Approved title", cover_image_url: null }],
    company_social_accounts: [{ id: "account", company_id: "company", platform: "twitter", account_id: "x-user", access_token_encrypted: "enc:access", refresh_token_encrypted: "enc:refresh", token_expires_at: "2099-01-01T00:00:00Z", is_active: true, platform_metadata: {} }],
    companies: [{ id: "company", social_networks: ["x"], post_pack: "b2b" }],
    users: [{ id: "publisher", role: "client", company_id: "company", can_publish: true }],
    content_images: [], content_assets: [], publishing_jobs: [{ ...structuredClone(job), status: "running" }],
  };
  vi.mocked(adapter.refreshIfNeeded).mockResolvedValue({ kind: "unchanged" });
  vi.mocked(adapter.publish).mockResolvedValue({ kind: "published", externalId: "post-id" });
});
afterEach(() => vi.unstubAllGlobals());

describe("direct social dispatch", () => {
  it("publishes the approved snapshot only to its chosen company account", async () => {
    expect(await run()).toBe("published");
    expect(adapter.publish).toHaveBeenCalledWith(expect.objectContaining({ text: "Approved post", account: expect.objectContaining({ companyId: "company", accountId: "x-user" }) }));
    expect(state.tables.publishing_jobs[0]).toMatchObject({ status: "published", external_id: "post-id" });
  });
  const denials: Array<[string, () => void]> = [
    ["withdrawn approval", () => { state.tables.content_pieces[0].approval_status = "pending"; }],
    ["changed copy", () => { state.tables.content_pieces[0].markdown_body = "Changed"; }],
    ["another company's piece", () => { state.tables.content_pieces[0].company_id = "other"; }],
    ["another company's account", () => { state.tables.company_social_accounts[0].company_id = "other"; }],
    ["changed provider identity", () => { state.tables.company_social_accounts[0].account_id = "other-user"; }],
    ["disconnection", () => { state.tables.company_social_accounts[0].is_active = false; }],
    ["withdrawn publishing permission", () => { state.tables.users[0].can_publish = false; }],
    ["a moved publisher", () => { state.tables.users[0].company_id = "other"; }],
    ["a disabled network", () => { state.tables.companies[0].social_networks = []; }],
    ["a fenced company pack", () => { state.tables.companies[0].post_pack = "hospitality"; }],
    ["changed media", () => { state.tables.content_pieces[0].cover_image_url = "https://other.test/post.jpg"; }],
  ];
  it.each(denials)("refuses %s before calling the provider", async (_label, change) => {
    change();
    expect(await run()).toBe("failed");
    expect(adapter.publish).not.toHaveBeenCalled();
    expect(state.tables.publishing_jobs[0]).toMatchObject({ response_payload: { outcome_uncertain: false } });
  });
  it("saves a refreshable expired grant before posting", async () => {
    state.tables.company_social_accounts[0].token_expires_at = "2020-01-01T00:00:00Z";
    vi.mocked(adapter.refreshIfNeeded).mockResolvedValue({ kind: "refreshed", credentials: { accessToken: "new-access", refreshToken: "new-refresh", expiresAt: "2099-01-01T00:00:00Z", providerMetadata: { refreshTokenExpiresAt: "2099-02-01T00:00:00Z" } } });
    vi.mocked(adapter.publish).mockImplementation(async () => {
      expect(state.tables.company_social_accounts[0]).toMatchObject({ access_token_encrypted: "enc:new-access", refresh_token_encrypted: "enc:new-refresh", platform_metadata: { refreshTokenExpiresAt: "2099-02-01T00:00:00Z" } });
      return { kind: "published", externalId: "post-id" };
    });
    expect(await run()).toBe("published");
  });
  it("does not overwrite a grant reconnected while refresh was running", async () => {
    vi.mocked(adapter.refreshIfNeeded).mockImplementation(async () => {
      state.tables.company_social_accounts[0].access_token_encrypted = "enc:reconnected";
      return { kind: "refreshed", credentials: { accessToken: "obsolete", refreshToken: "obsolete", expiresAt: "2099-01-01T00:00:00Z" } };
    });
    expect(await run()).toBe("failed");
    expect(adapter.publish).not.toHaveBeenCalled();
    expect(state.tables.company_social_accounts[0].access_token_encrypted).toBe("enc:reconnected");
  });
  it.each(["approval", "media", "account"])("rechecks %s after slow credential refresh", async (change) => {
    vi.mocked(adapter.refreshIfNeeded).mockImplementation(async () => {
      if (change === "approval") state.tables.content_pieces[0].approval_status = "pending";
      if (change === "media") state.tables.content_pieces[0].cover_image_url = "https://other.test/changed.jpg";
      if (change === "account") state.tables.company_social_accounts[0].is_active = false;
      return { kind: "unchanged" };
    });
    expect(await run()).toBe("failed");
    expect(adapter.publish).not.toHaveBeenCalled();
  });
  it("requires checking an inconclusive provider write and never retries it", async () => {
    vi.mocked(adapter.publish).mockResolvedValue({ kind: "uncertain", message: "Check the account" });
    expect(await run()).toBe("uncertain");
    expect(adapter.publish).toHaveBeenCalledTimes(1);
    expect(state.tables.publishing_jobs[0]).toMatchObject({ status: "failed", response_payload: { outcome_uncertain: true, manual_check_required: true } });
  });
  it("records a confirmed write as uncertain when saving its result fails", async () => {
    state.failPublishedSave = true;
    expect(await run()).toBe("uncertain");
    expect(adapter.publish).toHaveBeenCalledTimes(1);
    expect(state.tables.publishing_jobs[0]).toMatchObject({ response_payload: { outcome_uncertain: true, external_id: "post-id" } });
  });
});
