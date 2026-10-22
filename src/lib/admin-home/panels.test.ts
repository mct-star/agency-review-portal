import { describe, expect, it } from "vitest";
import { fakeSupabase } from "@/test/fake-supabase";
import { loadClients, loadJobs, loadTickets, loadWaiting } from "./panels";
import { ageLabel } from "./types";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const NOW = Date.parse("2026-10-15T09:00:00Z");

const companies = { data: [{ id: A, name: "Lakeside Brasserie", slug: "lakeside", post_pack: "hospitality", plan: "pro", trial_plan: null, trial_expires_at: "2026-10-18T00:00:00Z", created_at: "2026-10-14T00:00:00Z" }, { id: B, name: "BCB Medical", slug: "bcb", post_pack: "b2b", plan: "pro", trial_plan: null, trial_expires_at: null, created_at: "2026-03-19T00:00:00Z" }] };

describe("admin home panels", () => {
  it("Waiting offers Approve on a draft and sends a venue's draft to its approvals page", async () => {
    const { client } = fakeSupabase({
      companies,
      content_pieces: { data: [{ id: "p1", company_id: A, title: "Sunday roast", post_type: "dish", content_type: "social_post", created_at: "2026-10-15T08:00:00Z" }], count: 3 },
      photo_inventory: { data: [{ id: "ph1", company_id: A, original_filename: "x.jpg", scene_label: null, added_at: "2026-10-15T07:00:00Z" }] },
    });
    const panel = await loadWaiting(client as never, NOW);
    expect(panel.error).toBeUndefined();
    expect(panel.numbers[0]).toEqual({ label: "Drafts waiting", value: 1, tone: "warn" });
    const draft = panel.rows.find((r) => r.id === "draft-p1")!;
    expect(draft.href).toBe(`/approvals?company=${A}`);
    expect(draft.verbs[0]).toMatchObject({ label: "Approve", path: "/api/content/approve", body: { pieceId: "p1", status: "approved" } });
    const photo = panel.rows.find((r) => r.id === "photo-ph1")!;
    expect(photo.verbs.map((v) => v.label)).toEqual(["Approve", "Reject"]);
    expect(photo.verbs[0].body).toEqual({ companyId: A, ids: ["ph1"], decision: "approve" });
  });

  it("Clients ranks a trial ending this week first and offers View as", async () => {
    const { client } = fakeSupabase({ companies, content_pieces: { data: [{ company_id: B, created_at: "2026-10-14T00:00:00Z" }] } });
    const panel = await loadClients(client as never, NOW);
    expect(panel.numbers[1]).toEqual({ label: "Trials ending in 7 days", value: 1, tone: "warn" });
    expect(panel.rows[0].title).toBe("Lakeside Brasserie");
    expect(panel.rows[0].verbs[0]).toMatchObject({ label: "View as", path: "/api/view-as", body: { companyId: A } });
  });

  it("Jobs lists failures with no fake Retry verb", async () => {
    const { client } = fakeSupabase({
      companies,
      content_generation_jobs: { data: [{ id: "j1", company_id: A, job_type: "quick_post", provider: "claude", error_message: "Anthropic (529): overloaded https://x", created_at: "2026-10-14T10:00:00Z" }], count: 2 },
      publishing_jobs: { data: [] },
    });
    const panel = await loadJobs(client as never, NOW);
    expect(panel.rows).toHaveLength(1);
    expect(panel.rows[0].verbs).toEqual([]);
    expect(panel.rows[0].sub).not.toContain("https://");
  });

  it("Tickets offers Start and Resolve through the tickets route", async () => {
    const { client } = fakeSupabase({ companies, support_tickets: { data: [{ id: "t1", company_id: B, title: "Cannot upload", priority: "high", reporter_name: "Pat", status: "open", created_at: "2026-10-10T10:00:00Z" }], count: 0 } });
    const panel = await loadTickets(client as never, NOW);
    expect(panel.rows[0].sub).toContain("BCB Medical");
    expect(panel.rows[0].verbs.map((v) => v.path)).toEqual(["/api/support/tickets", "/api/support/tickets"]);
  });

  it("a read error becomes a panel error, not zeros", async () => {
    const { client } = fakeSupabase({ content_pieces: { error: { message: "relation missing" } } });
    const panel = await loadWaiting(client as never, NOW);
    expect(panel.error).toMatch(/relation missing/);
  });

  it("ageLabel reads naturally", () => {
    expect(ageLabel("2026-10-15T08:30:00Z", NOW)).toBe("30m ago");
    expect(ageLabel("2026-10-14T09:00:00Z", NOW)).toBe("24h ago");
    expect(ageLabel("2026-10-10T09:00:00Z", NOW)).toBe("5d ago");
  });
});
