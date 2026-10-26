import { describe, expect, it, vi } from "vitest";
import { fakeSupabase } from "@/test/fake-supabase";

vi.mock("@/lib/media/attach", () => ({
  attachLibraryItemToPiece: vi.fn(async (_s: unknown, id: string) => {
    if (id === "bad") throw new Error("That photo is waiting for approval and cannot be used yet");
    return { kind: "photo", publicUrl: "https://cdn/x.jpg" };
  }),
}));
vi.mock("@/lib/email/resend", () => ({ sendEmail: vi.fn(async () => ({ success: true })) }));

import { createHospitalityDraft, ensureWeek } from "./drafts";
import { notifyDraftReady } from "./notify";
import { sendEmail } from "@/lib/email/resend";

const base = {
  companyId: "co1", postTypeSlug: "weather_of_the_day", title: "Weather", body: "Fine day.\n\n#sunny",
  scheduledDate: "2026-10-14", scheduledTime: "07:00:00", autoSource: "weather_job" as const,
};

describe("createHospitalityDraft", () => {
  it("saves a pending post in the right week with the right day and time", async () => {
    const fake = fakeSupabase({
      weeks: { data: { id: "w1", week_number: 42, year: 2026, date_start: "2026-10-12" } },
      content_pieces: { data: { id: "p1" }, count: 2 },
    });
    const r = await createHospitalityDraft(fake.client as never, { ...base, imageIds: ["i1", "i2"] });
    expect(r).toMatchObject({ pieceId: "p1", weekId: "w1", imagesAttached: 2 });
    const insert = fake.calls.find((c) => c.table === "content_pieces" && c.method === "insert")!.args[0];
    expect(insert).toMatchObject({
      week_id: "w1", company_id: "co1", approval_status: "pending", day_of_week: "Wednesday",
      scheduled_date: "2026-10-14", scheduled_time: "07:00", auto_source: "weather_job", post_type: "weather_of_the_day", sort_order: 2,
    });
  });

  it("keeps the draft and reports it when a photo cannot be attached", async () => {
    const fake = fakeSupabase({ weeks: { data: { id: "w1", week_number: 42, year: 2026, date_start: "2026-10-12" } }, content_pieces: { data: { id: "p1" }, count: 0 } });
    const r = await createHospitalityDraft(fake.client as never, { ...base, imageIds: ["bad"] });
    expect(r.pieceId).toBe("p1");
    expect(r.imagesAttached).toBe(0);
    expect(r.imageError).toMatch(/waiting for approval/);
  });
});

describe("ensureWeek", () => {
  it("creates the week for a date when none exists, Monday to Sunday", async () => {
    let n = 0;
    const fake = fakeSupabase({
      weeks: () => (++n === 1 ? { data: null } : { data: { id: "new", week_number: 42, year: 2026, date_start: "2026-10-12" } }),
    });
    const w = await ensureWeek(fake.client as never, "co1", "2026-10-14");
    expect(w.id).toBe("new");
    expect(fake.calls.find((c) => c.method === "insert")!.args[0]).toMatchObject({ week_number: 42, year: 2026, date_start: "2026-10-12", date_end: "2026-10-18", status: "draft" });
  });
});

describe("notifyDraftReady", () => {
  it("notifies and emails each person in the company, with the post in the email", async () => {
    const fake = fakeSupabase({
      users: { data: [{ id: "u1", email: "sam@example.com", full_name: "Sam" }, { id: "u2", email: "jo@example.com", full_name: null }] },
      companies: { data: { name: "Lakeside" } },
    });
    const r = await notifyDraftReady(fake.client as never, { companyId: "co1", pieceId: "p1", headline: "Today's weather post is ready for you to approve", preview: "Fine day <b>today</b>" });
    expect(r).toEqual({ notified: 2, emailed: 2 });
    expect(fake.calls.filter((c) => c.table === "notifications" && c.method === "insert")).toHaveLength(2);
    const mail = (sendEmail as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(mail.to).toBe("sam@example.com");
    expect(mail.html).toContain("Fine day &lt;b&gt;today&lt;/b&gt;");
    expect(mail.html).toContain("/approvals");
  });
  it("gives AGENCY's viewer account the in-app notice but no email", async () => {
    (sendEmail as ReturnType<typeof vi.fn>).mockClear();
    const fake = fakeSupabase({
      users: { data: [{ id: "u1", email: "mct+lakeside@agencybristol.com", full_name: "Michael (Lakeside view)" }, { id: "u2", email: "sam@example.com", full_name: "Sam" }] },
      companies: { data: { name: "Lakeside" } },
    });
    const r = await notifyDraftReady(fake.client as never, { companyId: "co1", pieceId: "p1", headline: "h", preview: "p" });
    expect(r).toEqual({ notified: 2, emailed: 1 });
    expect(fake.calls.filter((c) => c.table === "notifications" && c.method === "insert")).toHaveLength(2);
    const to = (sendEmail as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0].to);
    expect(to).toEqual(["sam@example.com"]);
  });
  it("does nothing when the company has no users yet", async () => {
    const fake = fakeSupabase({ users: { data: [] } });
    expect(await notifyDraftReady(fake.client as never, { companyId: "co1", pieceId: "p", headline: "h", preview: "p" })).toEqual({ notified: 0, emailed: 0 });
  });
});
