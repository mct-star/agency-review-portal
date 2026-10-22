import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase } from "@/test/fake-supabase";

const A = "11111111-1111-4111-8111-111111111111";
const PIECE = "33333333-3333-4333-8333-333333333333";
const ITEM = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const state: { profile: unknown; supabase: ReturnType<typeof fakeSupabase> } = { profile: null, supabase: fakeSupabase() };
vi.mock("@/lib/supabase/admin", () => ({ getSignedInProfile: async () => state.profile, createAdminSupabaseClient: async () => state.supabase.client }));
const write = vi.fn(async (_input: { brief: string; forecastFacts?: string | null }) => ({ body: "Quiz.\n\n#quiz", caption: "Quiz.", hashtags: ["#quiz"], altText: "Bar", warnings: [], provider: "claude" }));
vi.mock("@/lib/hospitality/generate", () => ({ generateHospitalityPost: (input: { brief: string }) => write(input) }));

import { POST } from "./route";

const piece = (meta: Record<string, unknown>) => ({
  id: PIECE, company_id: A, week_id: "w", approval_status: "pending", auto_source: "weather_job", post_type: "event",
  markdown_body: "Old quiz post.\n\n#quiz", scheduled_date: "2026-10-22", source_meta: meta,
});
const item = { id: ITEM, company_id: A, kind: "event", title: "Quiz night", details: "Now £3 a head", starts_on: "2026-10-24", ends_on: null, start_time: "19:30", build_up: {}, status: "active", source: "manual" };
const call = () => POST(new Request("http://x", { method: "POST" }), { params: Promise.resolve({ id: PIECE }) });

beforeEach(() => {
  write.mockClear();
  state.profile = { id: "u", role: "client", company_id: A };
});

describe("Write it again, for a Coming up post", () => {
  it("rewrites from the item as it stands now, read within the piece's own company", async () => {
    state.supabase = fakeSupabase({
      content_pieces: { data: piece({ calendar_item_id: ITEM, slot: "two_days", brief: "Quiz night. £2 a head", facts: "high 14C" }) },
      companies: { data: { name: "Lakeside", industry: null, description: null, hospitality_settings: {} } },
      venue_calendar_items: { data: item },
    });
    const res = await call();
    expect(res.status).toBe(200);
    const input = write.mock.calls[0][0];
    expect(input.brief).toContain("Now £3 a head");
    expect(input.brief).toContain("this weekend");
    expect(input.forecastFacts).toBe("high 14C");
    const eqs = state.supabase.calls.filter((c) => c.table === "venue_calendar_items" && c.method === "eq").map((c) => c.args);
    expect(eqs).toContainEqual(["company_id", A]);
  });
  it("falls back to the brief kept with the draft when the item is gone", async () => {
    state.supabase = fakeSupabase({
      content_pieces: { data: piece({ calendar_item_id: ITEM, slot: "day_of", brief: "Quiz night. £2 a head" }) },
      companies: { data: { name: "Lakeside", industry: null, description: null, hospitality_settings: {} } },
      venue_calendar_items: { data: null },
    });
    expect((await call()).status).toBe(200);
    expect(write.mock.calls[0][0].brief).toBe("Quiz night. £2 a head");
  });
});
