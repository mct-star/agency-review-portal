import { beforeEach, describe, expect, it, vi } from "vitest";

const run = vi.fn(async (..._a: unknown[]) => [{ company: "Lakeside", status: "drafted", date: "2026-10-14", pieceId: "p", photos: 1 }]);
vi.mock("@/lib/supabase/admin", () => ({ createAdminSupabaseClient: async () => ({}) }));
vi.mock("@/lib/weather/draft-post", () => ({ runWeatherPosts: (...a: unknown[]) => (run as (...x: unknown[]) => unknown)(...a) }));

import { GET } from "./route";

const req = (auth?: string) => new Request("http://x/api/cron/weather-posts", { headers: auth ? { authorization: auth } : {} });

beforeEach(() => { run.mockClear(); vi.unstubAllEnvs(); });

describe("GET /api/cron/weather-posts", () => {
  it("refuses to run at all when CRON_SECRET is not set", async () => {
    vi.stubEnv("CRON_SECRET", "");
    expect((await GET(req("Bearer x"))).status).toBe(503);
    expect(run).not.toHaveBeenCalled();
  });
  it("refuses a wrong or missing secret", async () => {
    vi.stubEnv("CRON_SECRET", "s3cret");
    expect((await GET(req())).status).toBe(401);
    expect((await GET(req("Bearer nope"))).status).toBe(401);
    expect(run).not.toHaveBeenCalled();
  });
  it("limits a manual run to one company when asked, and refuses a malformed id", async () => {
    vi.stubEnv("CRON_SECRET", "s3cret");
    const id = "11111111-1111-4111-8111-111111111111";
    const ok = await GET(new Request(`http://x/api/cron/weather-posts?companyId=${id}`, { headers: { authorization: "Bearer s3cret" } }));
    expect(ok.status).toBe(200);
    expect(run.mock.calls[0][2]).toEqual({ companyId: id });
    const bad = await GET(new Request("http://x/api/cron/weather-posts?companyId=not-a-uuid", { headers: { authorization: "Bearer s3cret" } }));
    expect(bad.status).toBe(400);
  });
  it("runs with the right secret and reports what it drafted", async () => {
    vi.stubEnv("CRON_SECRET", "s3cret");
    const res = await GET(req("Bearer s3cret"));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, drafted: 1 });
  });
});
