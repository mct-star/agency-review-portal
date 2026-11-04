import { describe, it, expect } from "vitest";
import { pieceVersionHash, recordDecisions } from "./version-hash";

describe("pieceVersionHash", () => {
  it("matches the digest the Mac gate pins (test_content_approval_gate.py)", () => {
    expect(pieceVersionHash({ title: "Week 45 blog", markdown_body: "# Week 45 blog\n\nBody.", first_comment: null }))
      .toBe("8c80a7bcd8b6079b5e9951a5f2f79fea2cd20fc100e662ac2998c5a893fe659f");
  });

  it("changes when any field changes, and treats a missing first comment as empty", () => {
    const base = pieceVersionHash({ title: "a", markdown_body: "b", first_comment: "c" });
    expect(pieceVersionHash({ title: "a!", markdown_body: "b", first_comment: "c" })).not.toBe(base);
    expect(pieceVersionHash({ title: "a", markdown_body: "b!", first_comment: "c" })).not.toBe(base);
    expect(pieceVersionHash({ title: "a", markdown_body: "b", first_comment: "c!" })).not.toBe(base);
    expect(pieceVersionHash({ title: "a", markdown_body: "b", first_comment: null }))
      .toBe(pieceVersionHash({ title: "a", markdown_body: "b", first_comment: "" }));
  });
});

describe("recordDecisions", () => {
  const piece = { id: "p1", company_id: "c1", title: "T", markdown_body: "B", first_comment: null };

  function client(error: { message: string } | null = null) {
    const inserted: unknown[] = [];
    return {
      inserted,
      from: (table: string) => ({
        insert: async (rows: unknown[]) => { inserted.push({ table, rows }); return { error }; },
      }),
    };
  }

  it("appends one row per piece with its version hash, decision and decider", async () => {
    const c = client();
    expect(await recordDecisions(c as never, [piece], "approved", "u1", "review")).toBeNull();
    expect(c.inserted).toEqual([{ table: "content_approvals", rows: [{
      piece_id: "p1", company_id: "c1", version_hash: pieceVersionHash(piece),
      decision: "approved", decided_by: "u1", decided_via: "review", note: null,
    }] }]);
  });

  it("refuses a decision with no decider", async () => {
    expect(await recordDecisions(client() as never, [piece], "approved", "", "review")).toMatch(/person/);
  });

  it("returns the insert error", async () => {
    expect(await recordDecisions(client({ message: "boom" }) as never, [piece], "approved", "u1", "review")).toBe("boom");
  });
});
