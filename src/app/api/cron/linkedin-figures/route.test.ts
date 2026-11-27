import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const run = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase/admin", () => ({ createAdminSupabaseClient: async () => ({}) }));
vi.mock("@/lib/linkedin/figures", () => ({ runLinkedInFigures: run }));

import { GET } from "./route";

const req = (auth?: string) => new Request("http://x/api/cron/linkedin-figures", auth ? { headers: { authorization: auth } } : undefined);

beforeEach(() => { run.mockReset().mockResolvedValue({ accounts: 1, posts: 2, written: 2, unchanged: 0, errors: 0, rateLimited: false, skipped: [] }); });
afterEach(() => { delete process.env.CRON_SECRET; });

describe("GET /api/cron/linkedin-figures", () => {
  it("fails closed without CRON_SECRET, and refuses a wrong secret", async () => {
    expect((await GET(req())).status).toBe(503);
    process.env.CRON_SECRET = "s3cret";
    expect((await GET(req("Bearer wrong"))).status).toBe(401);
    expect(run).not.toHaveBeenCalled();
  });

  it("runs the job with the right secret and returns the counts", async () => {
    process.env.CRON_SECRET = "s3cret";
    const res = await GET(req("Bearer s3cret"));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, written: 2 });
  });

  it("is scheduled daily in vercel.json", async () => {
    const { default: config } = await import("../../../../../vercel.json");
    expect(config.crons.find((c: { path: string }) => c.path === "/api/cron/linkedin-figures")).toMatchObject({ schedule: "30 3 * * *" });
  });
});
