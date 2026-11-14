import { describe, expect, it } from "vitest";
import { renderReminderEmail } from "@/lib/email/reminders/render";
import type { DueReminder } from "./due";
import type { CompanyReminderData, PieceRow, WeekRow } from "./load";
import { dayMonthLabel, emailInputFor, manualStepsFor } from "./run";

const BASE = "https://app.example.com";
const WEEK: WeekRow = { id: "w1", date_start: "2026-11-09", date_end: "2026-11-15", status: "approved" } as WeekRow;

function piece(over: Partial<PieceRow> & { id: string }): PieceRow {
  return {
    week_id: "w1",
    title: "A title",
    content_type: "social_post",
    markdown_body: "Some text",
    post_type: null,
    approval_status: "approved",
    day_of_week: "Monday",
    scheduled_date: null,
    scheduled_time: "09:00",
    ...over,
  } as PieceRow;
}

function data(pieces: PieceRow[], dates: Record<string, string | null> = {}): CompanyReminderData {
  return {
    input: {
      cadence: { mode: "weekly_batch", reminder_hour: 9, reminder_recipients: ["sam@example.com"] },
      timeZone: "Europe/London",
      slots: [],
      weeks: [],
      pieces: pieces.map((p) => ({ id: p.id, week_id: p.week_id, date: dates[p.id] ?? null, time: p.scheduled_time, approval_status: p.approval_status })),
      captures: [],
      log: [],
      now: new Date("2026-11-09T08:00:00Z"),
    },
    weeksById: new Map([[WEEK.id, WEEK]]),
    piecesById: new Map(pieces.map((p) => [p.id, p])),
    firstNames: new Map([["sam@example.com", "Sam"]]),
  } as CompanyReminderData;
}

const due = (kind: DueReminder["kind"], over: Partial<DueReminder> = {}): DueReminder & { kind: any } => ({
  kind,
  recipient: "sam@example.com",
  subject_key: "k",
  is_follow_up: false,
  piece_id: null,
  week_id: "w1",
  ...over,
});

describe("dayMonthLabel", () => {
  it("gives a plain day and month with no hyphen, dash or colon", () => {
    expect(dayMonthLabel("2026-11-10")).toBe("10 November");
    expect(dayMonthLabel("2026-12-01")).toBe("1 December");
    expect(dayMonthLabel("2026-11-10")).not.toMatch(/[-:‐-―]/);
  });
});

describe("manualStepsFor, from the facts the deploy page uses", () => {
  it("is the scheduler step only when the week has no blog and no newsletter", () => {
    expect(manualStepsFor([piece({ id: "a" })], WEEK.date_start)).toEqual(["scheduler"]);
  });

  it("adds the blog for an approved blog article and the newsletter for an approved newsletter article", () => {
    const pieces = [piece({ id: "a" }), piece({ id: "b", content_type: "blog_article" }), piece({ id: "c", content_type: "linkedin_article" })];
    expect(manualStepsFor(pieces, WEEK.date_start)).toEqual(["blog", "scheduler", "newsletter"]);
    expect(manualStepsFor([pieces[1]], WEEK.date_start)).toEqual(["blog", "scheduler"]);
    expect(manualStepsFor([pieces[2]], WEEK.date_start)).toEqual(["scheduler", "newsletter"]);
  });

  it("leaves out a blog or newsletter that is not approved, as the deploy page does", () => {
    const pieces = [piece({ id: "b", content_type: "blog_article", approval_status: "pending" }), piece({ id: "c", content_type: "linkedin_article", approval_status: "pending" })];
    expect(manualStepsFor(pieces, WEEK.date_start)).toEqual(["scheduler"]);
  });
});

describe("emailInputFor, deploy_week", () => {
  it("passes the real manual steps, and they reach both emails", () => {
    const pieces = [piece({ id: "a" }), piece({ id: "b", content_type: "blog_article" })];
    for (const isFollowUp of [false, true]) {
      const built = emailInputFor(due("deploy_week", { is_follow_up: isFollowUp }), data(pieces), BASE);
      if (!("input" in built)) throw new Error("expected an input");
      expect(built.input).toMatchObject({ kind: "deploy_week", manualSteps: ["blog", "scheduler"] });
      const email = renderReminderEmail(built.input);
      expect(email.text.toLowerCase()).toContain("publishing the blog post");
      expect(email.text.toLowerCase()).toContain("uploading the scheduling file");
      expect(email.text.toLowerCase()).not.toContain("publishing the newsletter");
    }
  });
});

describe("emailInputFor, week_ready first post date", () => {
  const pieces = [piece({ id: "a" }), piece({ id: "b" })];

  it("passes the earliest piece date in the week as a plain date", () => {
    const built = emailInputFor(due("week_ready", { is_follow_up: true }), data(pieces, { a: "2026-11-12", b: "2026-11-10" }), BASE);
    if (!("input" in built)) throw new Error("expected an input");
    expect(built.input).toMatchObject({ kind: "week_ready", firstPostDate: "10 November" });
    expect(renderReminderEmail(built.input).text).toContain("Your first post is due on 10 November. Nothing is published");
  });

  it("passes null when no piece has a date, and the email keeps only the second sentence", () => {
    const built = emailInputFor(due("week_ready", { is_follow_up: true }), data(pieces), BASE);
    if (!("input" in built)) throw new Error("expected an input");
    expect(built.input).toMatchObject({ firstPostDate: null });
    const text = renderReminderEmail(built.input).text;
    expect(text).toContain("Nothing is published without your approval, so anything not approved will wait.");
    expect(text).not.toContain("Your first post is due");
  });

  it("ignores the dates of pieces in other weeks", () => {
    const other = piece({ id: "z", week_id: "w2" });
    const built = emailInputFor(due("week_ready"), data([...pieces, other], { a: "2026-11-12", z: "2026-11-02" }), BASE);
    if (!("input" in built)) throw new Error("expected an input");
    expect(built.input).toMatchObject({ firstPostDate: "12 November" });
  });
});

describe("emailInputFor, inputs the templates would refuse are skipped", () => {
  it("skips a week with nothing to count, a post with no title or text, and a newsletter with no title", () => {
    expect(emailInputFor(due("week_ready"), data([]), BASE)).toHaveProperty("skip");
    const post = piece({ id: "p", title: "   " });
    expect(emailInputFor(due("todays_post", { piece_id: "p" }), data([post], { p: "2026-11-09" }), BASE)).toHaveProperty("skip");
    const bare = piece({ id: "q", markdown_body: "  " });
    expect(emailInputFor(due("todays_post", { piece_id: "q" }), data([bare], { q: "2026-11-09" }), BASE)).toHaveProperty("skip");
    const news = piece({ id: "n", content_type: "linkedin_article", title: " " });
    expect(emailInputFor(due("manual_publish", { piece_id: "n" }), data([news]), BASE)).toHaveProperty("skip");
  });
});
