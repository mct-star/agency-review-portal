import { describe, expect, it } from "vitest";
import { fakeSupabase } from "@/test/fake-supabase";
import { realPorts } from "./draft-post";

describe("realPorts.claim", () => {
  it("claims a day nobody has touched", async () => {
    const fake = fakeSupabase({ weather_post_runs: { data: null } });
    expect(await realPorts(fake.client as never).claim("co1", "2026-10-14")).toBe(true);
  });
  it("does not claim a day that is already drafted", async () => {
    let n = 0;
    const fake = fakeSupabase({
      weather_post_runs: () => (++n === 1 ? { error: { message: "dup", code: "23505" } } : { data: { status: "drafted", error: null, updated_at: new Date().toISOString() } }),
    });
    expect(await realPorts(fake.client as never).claim("co1", "2026-10-14")).toBe(false);
  });
  it("does not claim a day another run started a moment ago", async () => {
    let n = 0;
    const fake = fakeSupabase({
      weather_post_runs: () => (++n === 1 ? { error: { message: "dup", code: "23505" } } : { data: { status: "failed", error: "running", updated_at: new Date().toISOString() } }),
    });
    expect(await realPorts(fake.client as never).claim("co1", "2026-10-14")).toBe(false);
  });
  it("retries a day whose last attempt failed", async () => {
    let n = 0;
    const fake = fakeSupabase({
      weather_post_runs: () => (++n === 1 ? { error: { message: "dup", code: "23505" } } : { data: { status: "failed", error: "Forecast service answered 503", updated_at: new Date(Date.now() - 3600_000).toISOString() } }),
    });
    expect(await realPorts(fake.client as never).claim("co1", "2026-10-14")).toBe(true);
  });
  it("retries a run that has been 'running' for far too long", async () => {
    let n = 0;
    const fake = fakeSupabase({
      weather_post_runs: () => (++n === 1 ? { error: { message: "dup", code: "23505" } } : { data: { status: "failed", error: "running", updated_at: new Date(Date.now() - 3600_000).toISOString() } }),
    });
    expect(await realPorts(fake.client as never).claim("co1", "2026-10-14")).toBe(true);
  });
});
