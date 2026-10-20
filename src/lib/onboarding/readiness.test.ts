import { describe, expect, it } from "vitest";
import { fakeSupabase } from "@/test/fake-supabase";
import { loadSetupReadiness, nextSetupStep } from "./readiness";
import { loadApprovedUnqueued } from "./home-work";

const A = "11111111-1111-4111-8111-111111111111";
type Client = Parameters<typeof loadSetupReadiness>[0];

describe("shared setup readiness", () => {
  it("uses saved shared brand, voice and current accounts, not personal completion flags", async () => {
    const fake = fakeSupabase({
      company_voice_profiles: { count: 1 },
      company_social_accounts: { data: [{ platform: "facebook", token_expires_at: null }] },
    });
    const ready = await loadSetupReadiness(fake.client as unknown as Client, { id: A, name: "Example", description: "A useful service" });
    expect(ready).toEqual({ brand: true, voice: true, connections: true, unavailable: false });
    expect(nextSetupStep(ready, false)).toBe("create");
    for (const table of ["company_voice_profiles", "company_social_accounts"]) {
      expect(fake.calls).toContainEqual({ table, method: "eq", args: ["company_id", A] });
    }
  });

  it("does not mark expired or invalid LinkedIn grants ready", async () => {
    const fake = fakeSupabase({ company_voice_profiles: { count: 0 }, company_social_accounts: { data: [
      { platform: "linkedin_personal", token_expires_at: null },
      { platform: "facebook", token_expires_at: "2020-01-01T00:00:00Z" },
      { platform: "instagram", token_expires_at: "invalid" },
    ] } });
    expect((await loadSetupReadiness(fake.client as unknown as Client, { id: A })).connections).toBe(false);
  });

  it("never asks a venue for a business voice profile and only checks its relevant accounts", async () => {
    const fake = fakeSupabase({ company_social_accounts: { data: [] } });
    const ready = await loadSetupReadiness(fake.client as unknown as Client, { id: A, post_pack: "hospitality", name: "Venue", description: "Food" });
    expect(ready.voice).toBe(true);
    expect(fake.calls.some((call) => call.table === "company_voice_profiles")).toBe(false);
    expect(fake.calls).toContainEqual({ table: "company_social_accounts", method: "in", args: ["platform", ["facebook", "instagram"]] });
    expect(nextSetupStep(ready, true)).toBe("connections");
  });

  it("surfaces a failed readiness query", async () => {
    const fake = fakeSupabase({ company_voice_profiles: { error: { message: "Unavailable" } }, company_social_accounts: { data: [] } });
    expect((await loadSetupReadiness(fake.client as unknown as Client, { id: A })).unavailable).toBe(true);
  });
});

describe("Home's approved content count", () => {
  it("excludes queued, scheduled, running, published, failed and uncertain attempts", async () => {
    const statuses = ["queued", "scheduled", "running", "published", "failed", "unknown", "cancelled"];
    const fake = fakeSupabase({
      content_pieces: { data: [{ id: "fresh" }, ...statuses.map((status) => ({ id: status }))], count: statuses.length + 1 },
      publishing_jobs: { data: statuses.map((status) => ({ content_piece_id: status, status })), count: statuses.length },
    });
    expect(await loadApprovedUnqueued(fake.client as unknown as Client, A)).toBe(1);
    for (const table of ["content_pieces", "publishing_jobs"]) {
      expect(fake.calls).toContainEqual({ table, method: "eq", args: ["company_id", A] });
    }
  });

  it("returns unknown when either source fails", async () => {
    const fake = fakeSupabase({ content_pieces: { data: [{ id: "fresh" }] }, publishing_jobs: { error: { message: "Unavailable" } } });
    expect(await loadApprovedUnqueued(fake.client as unknown as Client, A)).toBeNull();
  });

  it("does not claim a post is unqueued when either result was truncated", async () => {
    for (const truncated of ["content_pieces", "publishing_jobs"]) {
      const fake = fakeSupabase({
        content_pieces: { data: [{ id: "fresh" }], count: truncated === "content_pieces" ? 2 : 1 },
        publishing_jobs: { data: [], count: truncated === "publishing_jobs" ? 1 : 0 },
      });
      expect(await loadApprovedUnqueued(fake.client as unknown as Client, A)).toBeNull();
    }
  });
});
