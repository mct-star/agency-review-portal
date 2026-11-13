import { describe, expect, it } from "vitest";
import { remindersDue, zonedTime, type DueInput, type ReminderLogRow } from "./due";

// Week of Monday 16 to Sunday 22 November 2026. London is on GMT, so local
// time equals UTC in these tests unless a test says otherwise.
const LONDON = "Europe/London";
const at = (iso: string) => new Date(iso);

function input(overrides: Partial<DueInput> = {}): DueInput {
  return {
    cadence: { mode: "weekly_batch", reminder_hour: 8, reminder_recipients: ["owner@example.com"] },
    timeZone: LONDON,
    slots: [],
    weeks: [],
    pieces: [],
    captures: [],
    log: [],
    now: at("2026-11-13T09:00:00Z"),
    ...overrides,
  };
}

const week = (status: "draft" | "ready_for_review" | "approved" | "changes_requested" = "ready_for_review", deployed = false) => ({
  id: "week-1",
  status,
  deployed,
});

const piece = (id: string, date: string | null, time: string | null, approval: "pending" | "approved" | "changes_requested" = "pending") => ({
  id,
  week_id: "week-1",
  date,
  time,
  approval_status: approval,
});

const sent = (row: Omit<ReminderLogRow, "recipient"> & { recipient?: string }): ReminderLogRow => ({
  recipient: "owner@example.com",
  ...row,
});

describe("zonedTime", () => {
  it("turns a local wall-clock time into the right instant either side of a clock change", () => {
    expect(zonedTime("2027-03-26", "08:00", LONDON).toISOString()).toBe("2027-03-26T08:00:00.000Z"); // GMT
    expect(zonedTime("2027-03-29", "08:00", LONDON).toISOString()).toBe("2027-03-29T07:00:00.000Z"); // BST
    expect(zonedTime("2026-10-26", "08:00", LONDON).toISOString()).toBe("2026-10-26T08:00:00.000Z"); // back to GMT
    expect(zonedTime("2027-03-15", "08:00", "America/New_York").toISOString()).toBe("2027-03-15T12:00:00.000Z"); // EDT
  });
});

describe("recipients", () => {
  it("sends nothing when there are no recipients", () => {
    const due = remindersDue(
      input({
        cadence: { mode: "weekly_batch", reminder_hour: 8, reminder_recipients: [] },
        weeks: [week()],
        pieces: [piece("p1", "2026-11-16", "09:00")],
      }),
    );
    expect(due).toEqual([]);
  });

  it("sends one reminder per recipient, normalised and without duplicates", () => {
    const due = remindersDue(
      input({
        cadence: { mode: "weekly_batch", reminder_hour: 8, reminder_recipients: ["A@Example.com ", "a@example.com", "b@example.com", " "] },
        weeks: [week()],
        pieces: [piece("p1", "2026-11-16", "09:00")],
      }),
    );
    expect(due.map((r) => r.recipient)).toEqual(["a@example.com", "b@example.com"]);
  });
});

describe("week_ready", () => {
  const base = {
    weeks: [week("ready_for_review")],
    pieces: [piece("p1", "2026-11-16", "09:00"), piece("p2", "2026-11-18", "09:00")],
  };

  it("is due once the week is ready for review and the reminder hour has come", () => {
    expect(remindersDue(input({ ...base, now: at("2026-11-13T07:59:00Z") }))).toEqual([]);
    expect(remindersDue(input({ ...base, now: at("2026-11-13T08:00:00Z") }))).toEqual([
      { kind: "week_ready", recipient: "owner@example.com", subject_key: "week-1", is_follow_up: false, piece_id: null, week_id: "week-1" },
    ]);
  });

  it("is not due for a week still in draft", () => {
    expect(remindersDue(input({ ...base, weeks: [week("draft")] }))).toEqual([]);
  });

  it("follows up once, 24 hours before the first scheduled post", () => {
    const log = [sent({ kind: "week_ready", subject_key: "week-1", is_follow_up: false, sent_at: "2026-11-13T08:00:00Z" })];
    // First post Monday 16th 09:00, so the follow-up is Sunday 15th 09:00.
    expect(remindersDue(input({ ...base, log, now: at("2026-11-15T08:59:00Z") }))).toEqual([]);
    expect(remindersDue(input({ ...base, log, now: at("2026-11-15T09:00:00Z") }))).toEqual([
      { kind: "week_ready", recipient: "owner@example.com", subject_key: "week-1", is_follow_up: true, piece_id: null, week_id: "week-1" },
    ]);
    const both = [...log, sent({ kind: "week_ready", subject_key: "week-1", is_follow_up: true, sent_at: "2026-11-15T09:00:00Z" })];
    expect(remindersDue(input({ ...base, log: both, now: at("2026-11-15T20:00:00Z") }))).toEqual([]);
  });

  it("stays silent once every piece is approved", () => {
    const approved = [piece("p1", "2026-11-16", "09:00", "approved"), piece("p2", "2026-11-18", "09:00", "approved")];
    const kinds = remindersDue(input({ ...base, pieces: approved })).map((r) => r.kind);
    expect(kinds).not.toContain("week_ready");
  });

  it("does not resend a reminder that is already in the log", () => {
    const log = [sent({ kind: "week_ready", subject_key: "week-1", is_follow_up: false, sent_at: "2026-11-13T08:00:00Z" })];
    expect(remindersDue(input({ ...base, log, now: at("2026-11-13T15:00:00Z") }))).toEqual([]);
  });

  it("skips the follow-up when the first reminder only went out after the follow-up time", () => {
    const log = [sent({ kind: "week_ready", subject_key: "week-1", is_follow_up: false, sent_at: "2026-11-15T12:00:00Z" })];
    expect(remindersDue(input({ ...base, log, now: at("2026-11-15T13:00:00Z") }))).toEqual([]);
  });

  it("never sends the first reminder and the follow-up in the same run", () => {
    const due = remindersDue(input({ ...base, now: at("2026-11-15T10:00:00Z") }));
    expect(due.map((r) => r.is_follow_up)).toEqual([false]);
  });
});

describe("deploy_week", () => {
  const approvedPieces = [piece("p1", "2026-11-16", "09:00", "approved"), piece("p2", "2026-11-18", "12:00", "approved")];

  it("is due when the whole week is approved and not deployed", () => {
    const due = remindersDue(input({ weeks: [week("approved")], pieces: approvedPieces }));
    expect(due).toEqual([
      { kind: "deploy_week", recipient: "owner@example.com", subject_key: "week-1", is_follow_up: false, piece_id: null, week_id: "week-1" },
    ]);
  });

  it("is not due while any piece is unapproved", () => {
    const mixed = [piece("p1", "2026-11-16", "09:00", "approved"), piece("p2", "2026-11-18", "12:00")];
    const kinds = remindersDue(input({ weeks: [week("ready_for_review")], pieces: mixed })).map((r) => r.kind);
    expect(kinds).not.toContain("deploy_week");
  });

  it("follows up once, the morning of the first post", () => {
    const log = [sent({ kind: "deploy_week", subject_key: "week-1", is_follow_up: false, sent_at: "2026-11-13T09:00:00Z" })];
    const run = (now: string, extra: ReminderLogRow[] = []) =>
      remindersDue(input({ weeks: [week("approved")], pieces: approvedPieces, log: [...log, ...extra], now: at(now) }));
    expect(run("2026-11-16T07:59:00Z")).toEqual([]);
    expect(run("2026-11-16T08:00:00Z")).toEqual([
      { kind: "deploy_week", recipient: "owner@example.com", subject_key: "week-1", is_follow_up: true, piece_id: null, week_id: "week-1" },
    ]);
    expect(run("2026-11-17T08:00:00Z", [sent({ kind: "deploy_week", subject_key: "week-1", is_follow_up: true, sent_at: "2026-11-16T08:00:00Z" })])).toEqual([]);
  });

  it("stays silent once the week is deployed", () => {
    expect(remindersDue(input({ weeks: [week("approved", true)], pieces: approvedPieces, now: at("2026-11-16T08:00:00Z") }))).toEqual([]);
  });
});

describe("todays_post and the three modes", () => {
  // Wednesday 18 November 2026, a piece at 12:00.
  const today = "2026-11-18";
  const wednesdaySlot = { day_of_week: 3, scheduled_time: "12:00:00", is_active: true };
  const base = (mode: "weekly_batch" | "daily" | "posting_days", extra: Partial<DueInput> = {}) =>
    input({
      cadence: { mode, reminder_hour: 8, reminder_recipients: ["owner@example.com"] },
      weeks: [week("draft")],
      pieces: [piece("p1", today, "12:00")],
      now: at(`${today}T08:30:00Z`),
      ...extra,
    });
  const todays = (due: ReturnType<typeof remindersDue>) => due.filter((r) => r.kind === "todays_post");

  it("weekly_batch companies never get it", () => {
    expect(todays(remindersDue(base("weekly_batch", { slots: [wednesdaySlot] })))).toEqual([]);
  });

  it("daily companies get it every day there is an unapproved post, slot or not", () => {
    expect(todays(remindersDue(base("daily")))).toEqual([
      { kind: "todays_post", recipient: "owner@example.com", subject_key: "p1", is_follow_up: false, piece_id: "p1", week_id: "week-1" },
    ]);
  });

  it("posting_days companies get it only on a day with an active posting slot", () => {
    expect(todays(remindersDue(base("posting_days")))).toEqual([]);
    expect(todays(remindersDue(base("posting_days", { slots: [{ ...wednesdaySlot, is_active: false }] })))).toEqual([]);
    expect(todays(remindersDue(base("posting_days", { slots: [{ ...wednesdaySlot, day_of_week: 4 }] })))).toEqual([]);
    expect(todays(remindersDue(base("posting_days", { slots: [wednesdaySlot] })))).toHaveLength(1);
  });

  it("waits for the reminder hour", () => {
    expect(todays(remindersDue(base("daily", { now: at(`${today}T07:59:00Z`) })))).toEqual([]);
  });

  it("is not sent for an approved piece or a piece on another day", () => {
    expect(todays(remindersDue(base("daily", { pieces: [piece("p1", today, "12:00", "approved")] })))).toEqual([]);
    expect(todays(remindersDue(base("daily", { pieces: [piece("p1", "2026-11-19", "12:00")] })))).toEqual([]);
  });

  it("follows up once, two hours before the slot, and stops when the slot passes", () => {
    const first = sent({ kind: "todays_post", subject_key: "p1", is_follow_up: false, sent_at: `${today}T08:00:00Z` });
    expect(todays(remindersDue(base("daily", { log: [first], now: at(`${today}T09:59:00Z`) })))).toEqual([]);
    expect(todays(remindersDue(base("daily", { log: [first], now: at(`${today}T10:00:00Z`) })))).toEqual([
      { kind: "todays_post", recipient: "owner@example.com", subject_key: "p1", is_follow_up: true, piece_id: "p1", week_id: "week-1" },
    ]);
    expect(todays(remindersDue(base("daily", { log: [first], now: at(`${today}T12:00:00Z`) })))).toEqual([]);
    const both = [first, sent({ kind: "todays_post", subject_key: "p1", is_follow_up: true, sent_at: `${today}T10:00:00Z` })];
    expect(todays(remindersDue(base("daily", { log: both, now: at(`${today}T11:00:00Z`) })))).toEqual([]);
  });

  it("is not sent at all once the slot has passed", () => {
    expect(todays(remindersDue(base("daily", { now: at(`${today}T12:01:00Z`) })))).toEqual([]);
  });

  it("is closed by approval even after the first reminder went out", () => {
    const first = sent({ kind: "todays_post", subject_key: "p1", is_follow_up: false, sent_at: `${today}T08:00:00Z` });
    const due = remindersDue(base("daily", { log: [first], pieces: [piece("p1", today, "12:00", "approved")], now: at(`${today}T10:30:00Z`) }));
    expect(todays(due)).toEqual([]);
  });
});

describe("timezone and daylight saving", () => {
  // London clocks go forward at 01:00 UTC on Sunday 28 March 2027.
  const daily = (date: string, now: string, timeZone = LONDON) =>
    remindersDue(
      input({
        cadence: { mode: "daily", reminder_hour: 8, reminder_recipients: ["owner@example.com"] },
        timeZone,
        weeks: [week("draft")],
        pieces: [piece("p1", date, "12:00")],
        now: at(now),
      }),
    ).filter((r) => r.kind === "todays_post");

  it("uses the company's local reminder hour before the clocks go forward (GMT)", () => {
    expect(daily("2027-03-26", "2027-03-26T07:30:00Z")).toEqual([]);
    expect(daily("2027-03-26", "2027-03-26T08:00:00Z")).toHaveLength(1);
  });

  it("uses the company's local reminder hour after the clocks go forward (BST)", () => {
    expect(daily("2027-03-29", "2027-03-29T06:59:00Z")).toEqual([]);
    expect(daily("2027-03-29", "2027-03-29T07:00:00Z")).toHaveLength(1); // 08:00 BST
  });

  it("works on the day of the change itself", () => {
    expect(daily("2027-03-28", "2027-03-28T06:59:00Z")).toEqual([]);
    expect(daily("2027-03-28", "2027-03-28T07:00:00Z")).toHaveLength(1);
  });

  it("follows up two hours before the slot in local time after the change", () => {
    const log = [sent({ kind: "todays_post", subject_key: "p1", is_follow_up: false, sent_at: "2027-03-29T07:00:00Z" })];
    const run = (now: string) =>
      remindersDue(
        input({
          cadence: { mode: "daily", reminder_hour: 8, reminder_recipients: ["owner@example.com"] },
          weeks: [week("draft")],
          pieces: [piece("p1", "2027-03-29", "12:00")],
          log,
          now: at(now),
        }),
      ).filter((r) => r.kind === "todays_post");
    expect(run("2027-03-29T08:59:00Z")).toEqual([]); // 09:59 BST
    expect(run("2027-03-29T09:00:00Z")).toEqual([
      { kind: "todays_post", recipient: "owner@example.com", subject_key: "p1", is_follow_up: true, piece_id: "p1", week_id: "week-1" },
    ]);
  });

  it("reads 'today' in the company timezone, not UTC", () => {
    // 00:30 UTC on 19 November is 08:30 on 19 November in Singapore but
    // still 18 November in London.
    expect(daily("2026-11-19", "2026-11-19T00:30:00Z", "Asia/Singapore")).toHaveLength(1);
    expect(daily("2026-11-18", "2026-11-19T00:30:00Z", "Asia/Singapore")).toEqual([]);
  });

  it("uses the day of the week in the company timezone for posting days", () => {
    // 23:30 UTC on Tuesday 17 November is 08:30 on Wednesday 18 in Tokyo.
    const due = remindersDue(
      input({
        cadence: { mode: "posting_days", reminder_hour: 8, reminder_recipients: ["owner@example.com"] },
        timeZone: "Asia/Tokyo",
        slots: [{ day_of_week: 3, scheduled_time: "12:00", is_active: true }],
        weeks: [week("draft")],
        pieces: [piece("p1", "2026-11-18", "12:00")],
        now: at("2026-11-17T23:30:00Z"),
      }),
    );
    expect(due.map((r) => r.kind)).toEqual(["todays_post"]);
  });
});

describe("manual_publish", () => {
  const article = { ...piece("news-1", "2026-11-19", "10:00", "approved"), manual_publish: true, published: false };
  const run = (now: string, overrides: Partial<DueInput> = {}) =>
    remindersDue(input({ weeks: [week("approved", true)], pieces: [article], now: at(now), ...overrides })).filter((r) => r.kind === "manual_publish");

  it("is due at the reminder hour on the day the article is due", () => {
    expect(run("2026-11-18T20:00:00Z")).toEqual([]);
    expect(run("2026-11-19T07:59:00Z")).toEqual([]);
    expect(run("2026-11-19T08:00:00Z")).toEqual([
      { kind: "manual_publish", recipient: "owner@example.com", subject_key: "news-1", is_follow_up: false, piece_id: "news-1", week_id: "week-1" },
    ]);
  });

  it("follows up once, the next morning", () => {
    const first = sent({ kind: "manual_publish", subject_key: "news-1", is_follow_up: false, sent_at: "2026-11-19T08:00:00Z" });
    expect(run("2026-11-19T20:00:00Z", { log: [first] })).toEqual([]);
    expect(run("2026-11-20T08:00:00Z", { log: [first] })).toEqual([
      { kind: "manual_publish", recipient: "owner@example.com", subject_key: "news-1", is_follow_up: true, piece_id: "news-1", week_id: "week-1" },
    ]);
    const both = [first, sent({ kind: "manual_publish", subject_key: "news-1", is_follow_up: true, sent_at: "2026-11-20T08:00:00Z" })];
    expect(run("2026-11-21T08:00:00Z", { log: both })).toEqual([]);
  });

  it("stays silent once marked published", () => {
    expect(run("2026-11-19T08:00:00Z", { pieces: [{ ...article, published: true }] })).toEqual([]);
  });

  it("ignores pieces that are published automatically", () => {
    expect(run("2026-11-19T08:00:00Z", { pieces: [{ ...article, manual_publish: false }] })).toEqual([]);
  });
});

describe("capture_due", () => {
  const run = (capture: "none" | "casual" | "shoot", now: string, log: ReminderLogRow[] = []) =>
    remindersDue(input({ captures: [{ id: "c1", date: "2026-11-20", capture }], log, now: at(now) })).filter((r) => r.kind === "capture_due");
  const reminder = (is_follow_up: boolean) => ({
    kind: "capture_due",
    recipient: "owner@example.com",
    subject_key: "2026-11-20",
    is_follow_up,
    piece_id: null,
    week_id: null,
  });

  it("sends nothing for posts that need no capture", () => {
    expect(run("none", "2026-11-19T18:00:00Z")).toEqual([]);
    expect(run("none", "2026-11-20T08:00:00Z")).toEqual([]);
  });

  it("casual: the evening before, then the morning of", () => {
    expect(run("casual", "2026-11-19T17:59:00Z")).toEqual([]);
    expect(run("casual", "2026-11-19T18:00:00Z")).toEqual([reminder(false)]);
    const first = sent({ kind: "capture_due", subject_key: "2026-11-20", is_follow_up: false, sent_at: "2026-11-19T18:00:00Z" });
    expect(run("casual", "2026-11-20T07:59:00Z", [first])).toEqual([]);
    expect(run("casual", "2026-11-20T08:00:00Z", [first])).toEqual([reminder(true)]);
    const both = [first, sent({ kind: "capture_due", subject_key: "2026-11-20", is_follow_up: true, sent_at: "2026-11-20T08:00:00Z" })];
    expect(run("casual", "2026-11-20T12:00:00Z", both)).toEqual([]);
  });

  it("casual: nothing once the day has passed", () => {
    expect(run("casual", "2026-11-21T08:00:00Z")).toEqual([]);
  });

  it("shoot: seven days before, then two days before", () => {
    expect(run("shoot", "2026-11-13T07:59:00Z")).toEqual([]);
    expect(run("shoot", "2026-11-13T08:00:00Z")).toEqual([reminder(false)]);
    const first = sent({ kind: "capture_due", subject_key: "2026-11-20", is_follow_up: false, sent_at: "2026-11-13T08:00:00Z" });
    expect(run("shoot", "2026-11-18T07:59:00Z", [first])).toEqual([]);
    expect(run("shoot", "2026-11-18T08:00:00Z", [first])).toEqual([reminder(true)]);
  });

  it("shoot: never on the day itself, even if nothing has gone out yet", () => {
    expect(run("shoot", "2026-11-20T08:00:00Z")).toEqual([]);
    const first = sent({ kind: "capture_due", subject_key: "2026-11-20", is_follow_up: false, sent_at: "2026-11-13T08:00:00Z" });
    expect(run("shoot", "2026-11-20T08:00:00Z", [first])).toEqual([]);
  });

  it("one reminder per date, treated as a shoot when any capture that day is a shoot", () => {
    const due = remindersDue(
      input({
        captures: [
          { id: "c1", date: "2026-11-20", capture: "casual" },
          { id: "c2", date: "2026-11-20", capture: "shoot" },
        ],
        now: at("2026-11-13T08:00:00Z"),
      }),
    );
    expect(due).toEqual([reminder(false)]);
  });
});

describe("purity", () => {
  it("returns the same answer for the same input and does not change it", () => {
    const i = input({ weeks: [week()], pieces: [piece("p1", "2026-11-16", "09:00")] });
    const copy = JSON.parse(JSON.stringify(i));
    const a = remindersDue(i);
    const b = remindersDue(i);
    expect(a).toEqual(b);
    expect(JSON.parse(JSON.stringify(i))).toEqual(copy);
  });
});
