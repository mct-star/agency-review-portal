import { describe, expect, it } from "vitest";
import { decideLeftForScheduler } from "./left-for-scheduler";
import { liveLinkedInStatus } from "@/lib/publishing/live-linkedin-jobs";

describe("decideLeftForScheduler", () => {
  const base = { title: "A post", companyNetworks: null, inLinkedInQueue: false, approvalRefusal: null };

  it("keeps a post that is not in the queue and whose approval matches", () => {
    expect(decideLeftForScheduler(base)).toEqual({ include: true, networks: null, note: null });
  });

  it("leaves out a queued post for a LinkedIn-only company", () => {
    expect(decideLeftForScheduler({ ...base, inLinkedInQueue: true })).toMatchObject({ include: false });
  });

  it("keeps a queued post's other networks, without LinkedIn", () => {
    expect(decideLeftForScheduler({ ...base, inLinkedInQueue: true, companyNetworks: ["linkedin", "x"] }))
      .toMatchObject({ include: true, networks: ["x"] });
  });

  it("leaves out a post whose approval does not match its text, on every network", () => {
    expect(decideLeftForScheduler({ ...base, companyNetworks: ["x"], approvalRefusal: "It was edited after approval." }))
      .toMatchObject({ include: false, note: "A post was left out of this file. It was edited after approval." });
  });
});

describe("liveLinkedInStatus", () => {
  it("counts queued, scheduled, running and published jobs, and an uncertain failure", () => {
    for (const status of ["queued", "scheduled", "running", "published"]) expect(liveLinkedInStatus({ content_piece_id: "p", status })).toBe(status);
    expect(liveLinkedInStatus({ content_piece_id: "p", status: "failed", response_payload: { outcome_uncertain: true } })).toBe("uncertain");
  });

  it("does not count a plain failure: nothing went out", () => {
    expect(liveLinkedInStatus({ content_piece_id: "p", status: "failed", response_payload: { outcome_uncertain: false } })).toBeNull();
    expect(liveLinkedInStatus({ content_piece_id: "p", status: "failed" })).toBeNull();
  });
});
