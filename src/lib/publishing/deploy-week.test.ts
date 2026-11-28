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
      piece({ id: "untimed", day_of_week: null, scheduled_time: null }),
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

  it("refuses an unapproved piece and lists it, never offering it, without holding back approved ones", () => {
    const plan = planWeekDeploy([piece({ id: "ok" }), piece({ id: "waiting", approval_status: "pending" })], "2026-11-16", now);
    expect(plan.ready).toBe(true);
    expect(plan.unapproved).toBe(1);
    expect(plan.unapprovedPieces.map((p) => p.pieceId)).toEqual(["waiting"]);
    expect(plan.social.map((s) => s.pieceId)).toEqual(["ok"]);
  });

  it("is not ready for an empty week", () => {
    expect(planWeekDeploy([], "2026-11-16", now).ready).toBe(false);
  });

  it("plans with the queue's own eligibility: only social posts and videos are offered to it", () => {
    const plan = planWeekDeploy([
      piece({ id: "post" }),
      piece({ id: "video", content_type: "video" }),
      piece({ id: "meme", content_type: "meme" }),
      piece({ id: "script", content_type: "video_script" }),
    ], "2026-11-16", now);
    expect(plan.social.map((s) => s.pieceId)).toEqual(["post", "video"]);
    expect(plan.manualSocial.map((s) => [s.pieceId, s.next])).toEqual([["meme", "export"], ["script", "by_hand"]]);
  });

  it("never says the scheduler export carries a video whose time has passed", () => {
    const plan = planWeekDeploy([piece({ id: "late", content_type: "video", day_of_week: "monday", scheduled_time: "08:00" })], "2026-11-16", now);
    expect(plan.manualSocial[0]).toMatchObject({ pieceId: "late", next: "by_hand" });
  });
});

describe("default slots and day selection", () => {
  const now = new Date("2026-11-16T09:00:00Z");
  const profile = (id: string, day: string, extra: Partial<DeployPiece> = {}) =>
    piece({ id, day_of_week: day, scheduled_time: null, post_type: "personal", ...extra });
  const page = (id: string, day: string) => piece({ id, day_of_week: day, scheduled_time: null, post_type: "agency_story" });

  it("puts the profile at 10:30 Monday to Saturday and never on a Sunday", () => {
    const plan = planWeekDeploy([profile("sat", "saturday"), profile("sun", "sunday"), profile("tue", "tuesday")], "2026-11-16", now);
    expect(plan.social.find((s) => s.pieceId === "sat")?.scheduledFor).toBe("2026-11-21T10:30:00.000Z");
    expect(plan.social.find((s) => s.pieceId === "tue")?.scheduledFor).toBe("2026-11-17T10:30:00.000Z");
    expect(plan.manualSocial.map((s) => s.pieceId)).toEqual(["sun"]);
  });

  it("puts the AGENCY page at 09:00 and 12:00, the day's first and second page post, and a third has no slot", () => {
    const plan = planWeekDeploy([page("a", "tuesday"), page("b", "tuesday"), page("c", "tuesday")], "2026-11-16", now);
    expect(plan.social.map((s) => s.scheduledFor)).toEqual(["2026-11-17T09:00:00.000Z", "2026-11-17T12:00:00.000Z"]);
    expect(plan.manualSocial.map((s) => s.pieceId)).toEqual(["c"]);
  });

  it("keeps a piece's own time over the default", () => {
    const plan = planWeekDeploy([profile("own", "tuesday", { scheduled_time: "07:15" })], "2026-11-16", now);
    expect(plan.social[0].scheduledFor).toBe("2026-11-17T07:15:00.000Z");
  });

  it("schedules only the ticked days and lists the rest as unselected", () => {
    const plan = planWeekDeploy([profile("tue", "tuesday"), profile("wed", "wednesday"), profile("thu", "thursday")], "2026-11-16", now, { days: ["2026-11-17", "2026-11-19"] });
    expect(plan.social.map((s) => s.pieceId).sort()).toEqual(["thu", "tue"]);
    expect(plan.unselected.map((s) => s.pieceId)).toEqual(["wed"]);
    expect(planWeekDeploy([profile("tue", "tuesday")], "2026-11-16", now, { days: [] }).social).toHaveLength(0);
  });
});
