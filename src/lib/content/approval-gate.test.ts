import { describe, expect, it } from "vitest";
import { APPROVAL_REFUSALS, approvalRefusal, newestApprovals, type GatePiece } from "./approval-gate";
import { pieceVersionHash } from "./version-hash";

const piece: GatePiece = { id: "p1", approval_status: "approved", title: "A post", markdown_body: "Approved words", first_comment: null };
const row = (extra: Record<string, unknown> = {}) => ({
  piece_id: "p1", version_hash: pieceVersionHash(piece), decision: "approved", decided_at: "2026-11-10T09:00:00.000Z", ...extra,
});

describe("approvalRefusal", () => {
  it("lets through a piece whose newest approval matches its current text", () => {
    expect(approvalRefusal(piece, row())).toBeNull();
  });

  it("refuses a piece edited after approval: title, body or first comment", () => {
    expect(approvalRefusal({ ...piece, markdown_body: "Edited" }, row())).toBe(APPROVAL_REFUSALS.edited);
    expect(approvalRefusal({ ...piece, title: "New title" }, row())).toBe(APPROVAL_REFUSALS.edited);
    expect(approvalRefusal({ ...piece, first_comment: "Added later" }, row())).toBe(APPROVAL_REFUSALS.edited);
  });

  it("refuses a piece with no recorded approval", () => {
    expect(approvalRefusal(piece, undefined)).toBe(APPROVAL_REFUSALS.noRecord);
  });

  it("refuses when the newest decision asked for changes, or the status is not approved", () => {
    expect(approvalRefusal(piece, row({ decision: "changes_requested" }))).toBe(APPROVAL_REFUSALS.changesRequested);
    expect(approvalRefusal({ ...piece, approval_status: "pending" }, row())).toBe(APPROVAL_REFUSALS.notApproved);
  });
});

describe("newestApprovals", () => {
  const client = (rows: unknown[], error: unknown = null) => {
    const calls: Array<[string, unknown]> = [];
    const chain: Record<string, unknown> = {};
    chain.select = () => chain;
    chain.order = () => chain;
    chain.eq = (k: string, v: unknown) => { calls.push([k, v]); return chain; };
    chain.in = (k: string, v: unknown) => { calls.push([k, v]); return chain; };
    chain.then = (resolve: (v: unknown) => void) => resolve({ data: rows, error });
    return { supabase: { from: () => chain } as never, calls };
  };

  it("keeps the newest decision per piece whatever order the rows come in, filtered on the company", async () => {
    const { supabase, calls } = client([row({ decided_at: "2026-11-12T09:00:00.000Z", decision: "changes_requested" }), row()]);
    const newest = await newestApprovals(supabase, "company-1", ["p1"]);
    expect(newest?.get("p1")?.decision).toBe("changes_requested");
    expect(calls).toContainEqual(["company_id", "company-1"]);
  });

  it("answers null when the record cannot be read, so the caller refuses", async () => {
    expect(await newestApprovals(client([], { message: "down" }).supabase, "company-1", ["p1"])).toBeNull();
  });
});
