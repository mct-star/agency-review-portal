import { describe, expect, it } from "vitest";
import { londonWallClockToUtc, planWeekDeploy, scheduledForPiece, type DeployPiece } from "./deploy-week";

const piece = (extra: Partial<DeployPiece>): DeployPiece => ({
  id: "p", title: "A post", content_type: "social_post", approval_status: "approved",
  day_of_week: "tuesday", scheduled_time: "08:30", scheduled_date: null, ...extra,
});

describe("londonWallClockToUtc", () => {
  it("reads a winter time as GMT and a summer time as BST", () => {
    expect(londonWallClockToUtc("2026-11-17", "08:30")).toBe("2026-11-17T08:30:00.000Z");
    expect(londonWallClockToUtc("2026-07-14", "08:30")).toBe("2026-07-14T07:30:00.000Z");
    expect(londonWallClockToUtc("2026-07-14", "08:30:00")).toBe("2026-07-14T07:30:00.000Z");
  });

  it("refuses a malformed date or time", () => {
    expect(londonWallClockToUtc("17/11/2026", "08:30")).toBeNull();
    expect(londonWallClockToUtc("2026-11-17", "8.30am")).toBeNull();
  });
});

describe("scheduledForPiece", () => {
  it("places the piece on its day in the week at its UK time", () => {
    expect(scheduledForPiece(piece({}), "2026-11-16")).toBe("2026-11-17T08:30:00.000Z");
  });

  it("prefers the piece's own scheduled date", () => {
    expect(scheduledForPiece(piece({ scheduled_date: "2026-11-20" }), "2026-11-16")).toBe("2026-11-20T08:30:00.000Z");
  });

  it("never guesses a missing day or time", () => {
    expect(scheduledForPiece(piece({ day_of_week: null }), "2026-11-16")).toBeNull();
    expect(scheduledForPiece(piece({ scheduled_time: null }), "2026-11-16")).toBeNull();
  });
});

describe("planWeekDeploy", () => {
  const now = new Date("2026-11-16T09:00:00Z");

  it("sends future approved social posts to the queue and everything else to the manual list", () => {
    const plan = planWeekDeploy([
      piece({ id: "future" }),
      piece({ id: "past", day_of_week: "monday", scheduled_time: "08:00" }),
      piece({ id: "untimed", scheduled_time: null }),
      piece({ id: "blog", content_type: "blog_article" }),
      piece({ id: "news", content_type: "linkedin_article" }),
      piece({ id: "guide", content_type: "pdf_guide" }),
    ], "2026-11-16", now);
    expect(plan.ready).toBe(true);
    expect(plan.social.map((s) => s.pieceId)).toEqual(["future"]);
    expect(plan.social[0].scheduledFor).toBe("2026-11-17T08:30:00.000Z");
    expect(plan.manualSocial.map((s) => s.pieceId)).toEqual(["past", "untimed"]);
    expect(plan.blogs.map((b) => b.id)).toEqual(["blog"]);
    expect(plan.newsletters.map((n) => n.id)).toEqual(["news"]);
  });

  it("is not ready while any piece is unapproved, and never offers an unapproved piece", () => {
    const plan = planWeekDeploy([piece({ id: "ok" }), piece({ id: "waiting", approval_status: "pending" })], "2026-11-16", now);
    expect(plan.ready).toBe(false);
    expect(plan.unapproved).toBe(1);
    expect(plan.social.map((s) => s.pieceId)).toEqual(["ok"]);
  });

  it("is not ready for an empty week", () => {
    expect(planWeekDeploy([], "2026-11-16", now).ready).toBe(false);
  });
});
