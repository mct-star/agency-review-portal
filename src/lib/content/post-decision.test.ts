import { describe, it, expect, vi } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { postDecision } from "./post-decision";

describe("postDecision", () => {
  it("sends the decision to the recording approval route", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ piece: { id: "p1" } }), { status: 200 }));
    const out = await postDecision("p1", "approved", undefined, fetcher as unknown as typeof fetch);
    expect(out).toEqual({ ok: true });
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/content/approve");
    expect(JSON.parse(String(init.body))).toEqual({ pieceId: "p1", status: "approved" });
  });

  it("returns the route's reason when it refuses", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 }));
    const out = await postDecision("p1", "changes_requested", "Shorter", fetcher as unknown as typeof fetch);
    expect(out).toEqual({ ok: false, error: "Unauthorized" });
  });
});

/** Every place that writes approval_status for a decision must record it first. */
describe("no approval path skips the approvals record", () => {
  function files(dir: string): string[] {
    return readdirSync(dir).flatMap((f) => {
      const p = join(dir, f);
      return statSync(p).isDirectory() ? files(p) : /\.(ts|tsx)$/.test(f) && !/\.test\./.test(f) ? [p] : [];
    });
  }
  it("every source file that sets a piece to approved also records the decision", () => {
    const writes = files(join(process.cwd(), "src")).filter((f) => {
      const s = readFileSync(f, "utf8");
      return /update\(\{[^}]*approval_status:\s*(status|"approved")/.test(s);
    });
    expect(writes.length).toBeGreaterThan(0);
    for (const f of writes) expect(readFileSync(f, "utf8"), f).toContain("recordDecisions");
  });
});
