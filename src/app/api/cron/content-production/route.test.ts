import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ run: vi.fn() }));
vi.mock("@/lib/api-production/runner", () => ({ runApiProductionBatch: state.run }));
import { GET, maxDuration } from "./route";
const request = (auth?: string) => new Request("https://example.com/api/cron/content-production", { headers: auth ? { authorization: auth } : {} });
beforeEach(() => { vi.unstubAllEnvs(); state.run.mockReset(); state.run.mockResolvedValue({ attempted: 0, results: [] }); });
describe("hosted production recovery cron", () => {
  it("fails closed with no configured secret", async () => {
    vi.stubEnv("CRON_SECRET", "");
    expect((await GET(request("Bearer x"))).status).toBe(503);
    expect(state.run).not.toHaveBeenCalled();
  });
  it("requires the cron bearer secret", async () => {
    vi.stubEnv("CRON_SECRET", "secret");
    expect((await GET(request())).status).toBe(401);
    expect((await GET(request("Bearer nope"))).status).toBe(401);
    expect(state.run).not.toHaveBeenCalled();
  });
  it("runs bounded recovery with a valid secret", async () => {
    vi.stubEnv("CRON_SECRET", "secret");
    const response = await GET(request("Bearer secret"));
    expect(await response.json()).toEqual({ ok: true, attempted: 0, results: [] });
    expect(maxDuration).toBe(300);
    expect(state.run).toHaveBeenCalledOnce();
  });
  it("makes failures visible without returning raw database details", async () => {
    vi.stubEnv("CRON_SECRET", "secret"); state.run.mockRejectedValue(new Error("private details"));
    const response = await GET(request("Bearer secret"));
    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain("private details");
  });
});
