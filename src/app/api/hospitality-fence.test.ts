import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase } from "@/test/fake-supabase";

/**
 * A hospitality venue's own person who calls an old business-to-business batch
 * route gets a clear 403, not a 500 and not a half-run LinkedIn job.
 */
const C = "11111111-1111-4111-8111-111111111111";
const state: { user: Record<string, unknown> | null; supabase: ReturnType<typeof fakeSupabase> } = { user: null, supabase: fakeSupabase() };

vi.mock("@/lib/supabase/admin", () => ({
  requireCompanyUser: async () => state.user,
  requireAdmin: async () => (state.user?.role === "admin" ? state.user : null),
  createAdminSupabaseClient: async () => state.supabase.client,
}));
vi.mock("@/lib/supabase/server", () => ({
  getUserProfile: async () => state.user,
  createServerSupabaseClient: async () => state.supabase.client,
}));

import { POST as monthFill } from "./generate/month-fill/route";
import { POST as createRepurpose } from "./create/repurpose/route";
import { POST as generateRepurpose } from "./generate/repurpose/route";
import { POST as quick } from "./generate/quick/route";
import { GET as interviewGet, POST as interviewPost } from "./strategy/interview/route";
import { POST as strategyDocument } from "./strategy/generate-document/route";
import { POST as competitor } from "./strategy/competitor/route";

const post = (body: Record<string, unknown>) =>
  new Request("http://x/api", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

const calls: Array<[string, () => Promise<Response>]> = [
  ["POST /api/generate/month-fill", () => monthFill(post({ companyId: C, year: 2026, month: 9 }))],
  ["POST /api/create/repurpose", () => createRepurpose(post({ companyId: C, content: "x".repeat(200) }))],
  ["POST /api/generate/repurpose", () => generateRepurpose(post({ companyId: C, sourceText: "x".repeat(200) }))],
  ["POST /api/generate/quick", () => quick(post({ companyId: C, topic: "A topic", postTypeSlug: "problem_diagnosis" }))],
  ["GET /api/strategy/interview", () => interviewGet(new Request(`http://x/api/strategy/interview?companyId=${C}`))],
  ["POST /api/strategy/interview", () => interviewPost(post({ companyId: C, step: 1, responses: {} }))],
  ["POST /api/strategy/generate-document", () => strategyDocument(post({ companyId: C }))],
  ["POST /api/strategy/competitor", () => competitor(post({ companyId: C, linkedInUrl: "https://www.linkedin.com/in/someone" }))],
];

beforeEach(() => {
  state.user = { id: "u", role: "client", company_id: C };
  state.supabase = fakeSupabase({ companies: { data: { post_pack: "hospitality" } } });
});

describe("old business-to-business routes, reached by a hospitality venue", () => {
  for (const [name, call] of calls) {
    it(`${name} answers 403 with a message`, async () => {
      const res = await call();
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.code).toBe("not_in_your_pack");
      expect(body.error).toMatch(/Write a post/);
    });
  }

  it("still answers 401 to a signed-out caller, before anything about the pack", async () => {
    state.user = null;
    for (const [, call] of calls) expect((await call()).status).toBe(401);
  });
});
