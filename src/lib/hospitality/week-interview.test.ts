import { describe, expect, it, vi } from "vitest";
import { planWeekFromTranscript, type WeekInterviewDeps } from "./week-interview";
import type { LibraryCandidate } from "@/lib/media/select-images";

const photo = (id: string, tags: string[], over: Partial<LibraryCandidate> = {}): LibraryCandidate => ({
  id, kind: "photo", tags, people_present: false, last_used_at: null, used_in_weeks: [], status: "approved", ...over,
});
const fixed = () => 0.5;

const plan = (posts: unknown[]) => JSON.stringify({ posts });
const item = (date: string, postType: string, brief: string, extra: Record<string, unknown> = {}) => ({ date, postType, brief, place: [], subject: [], ...extra });

function deps(planText: string, over: Partial<WeekInterviewDeps> = {}) {
  const drafts: Array<Record<string, unknown>> = [];
  const d: WeekInterviewDeps = {
    plan: vi.fn(async () => planText),
    write: vi.fn(async (pt, it) => ({ body: `Post about ${it.brief}\n\n#lunch`, caption: `Post about ${it.brief}`, hashtags: ["#lunch"], altText: "A photo", warnings: [], provider: "gemini" })),
    candidates: vi.fn(async () => [
      photo("food1", ["subject:food", "place:dining_room"]),
      photo("food2", ["subject:food", "place:kitchen"]),
      photo("deck", ["place:deck", "subject:empty_scene"]),
      photo("bar", ["place:bar", "subject:drink"]),
      photo("event", ["subject:event", "place:dining_room"]),
    ]),
    draft: vi.fn(async (i) => { drafts.push(i as unknown as Record<string, unknown>); return { pieceId: `p${drafts.length}`, weekId: "w", imagesAttached: ((i.imageIds ?? []) as string[]).length }; }),
    ...over,
  };
  return { d, drafts };
}

// The week of Mon 19 October 2026.
const args = { companyId: "co1", venueName: "Lakeside", settings: {}, weekAnyDate: "2026-10-21", transcript: "Wed wine tasting at 7, Fri fish and chips, Sunday roast." };

const FULL = plan([
  item("2026-10-19", "whats_on_this_week", "Wed wine tasting at 7, Fri fish and chips, Sun roast"),
  item("2026-10-20", "event", "Wine tasting Wednesday at 7"),
  item("2026-10-21", "event", "Wine tasting Wednesday at 7"),
  item("2026-10-23", "special_of_the_day", "Fish and chips deal", { subject: ["food"] }),
  item("2026-10-25", "special_of_the_day", "Sunday roast, book ahead", { subject: ["food"] }),
]);

describe("planWeekFromTranscript", () => {
  it("turns a dictation into pending drafts, one per planned post, each on its day", async () => {
    const { d, drafts } = deps(FULL);
    const r = await planWeekFromTranscript(args, d, fixed);
    expect(r.created).toHaveLength(5);
    expect(r.notes).toEqual([]);
    expect(drafts.map((x) => x.scheduledDate)).toEqual(["2026-10-19", "2026-10-20", "2026-10-21", "2026-10-23", "2026-10-25"]);
    expect(drafts.every((x) => x.autoSource === "weekly_interview")).toBe(true);
    expect(r.created.map((c) => c.dayName)).toEqual(["Monday", "Tuesday", "Wednesday", "Friday", "Sunday"]);
  });

  it("gives every post a type-appropriate time", async () => {
    const { d, drafts } = deps(FULL);
    await planWeekFromTranscript(args, d, fixed);
    expect(drafts[0].scheduledTime).toBe("09:00"); // what's on
    expect(drafts[1].scheduledTime).toBe("12:00"); // event
    expect(drafts[3].scheduledTime).toBe("11:30"); // special
  });

  it("writes each post from its own brief only", async () => {
    const { d } = deps(FULL);
    await planWeekFromTranscript(args, d, fixed);
    const briefs = (d.write as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[1].brief);
    expect(briefs).toContain("Fish and chips deal");
    expect(briefs).toContain("Wine tasting Wednesday at 7");
  });

  it("suggests a library photo that suits each post and does not repeat one across the week", async () => {
    const { d, drafts } = deps(FULL);
    await planWeekFromTranscript(args, d, fixed);
    const used = drafts.flatMap((x) => x.imageIds as string[]);
    expect(used.length).toBe(5);
    expect(new Set(used).size).toBe(5);
    // A special asked for food, so it got one of the two food photos.
    expect(["food1", "food2"]).toContain((drafts[3].imageIds as string[])[0]);
  });

  it("reuses a photo rather than leave a post bare when the library is small", async () => {
    const { d, drafts } = deps(FULL, { candidates: vi.fn(async () => [photo("only", ["subject:food", "place:dining_room"])]) });
    const r = await planWeekFromTranscript(args, d, fixed);
    expect(drafts.every((x) => (x.imageIds as string[]).length === 1)).toBe(true);
    expect(r.created.every((c) => c.hasPhoto)).toBe(true);
  });

  it("says so, and still drafts, when there is no photo at all", async () => {
    const { d } = deps(FULL, { candidates: vi.fn(async () => []), draft: vi.fn(async () => ({ pieceId: "p", weekId: "w", imagesAttached: 0 })) });
    const r = await planWeekFromTranscript(args, d, fixed);
    expect(r.created).toHaveLength(5);
    expect(r.notes.join(" ")).toMatch(/no photo yet/);
  });

  it("is honest when the dictation supports fewer than five posts", async () => {
    const { d } = deps(plan([item("2026-10-21", "event", "Wine tasting Wednesday at 7"), item("2026-10-23", "special_of_the_day", "Fish and chips")]));
    const r = await planWeekFromTranscript(args, d, fixed);
    expect(r.created).toHaveLength(2);
    expect(r.notes.join(" ")).toMatch(/found 2 things/);
  });

  it("drops anything outside the week or of an unknown kind, and reports it", async () => {
    const { d } = deps(plan([item("2026-11-02", "event", "Next month thing"), item("2026-10-22", "weather_of_the_day", "Rain"), item("2026-10-22", "event", "Quiz night Thursday")]));
    const r = await planWeekFromTranscript(args, d, fixed);
    expect(r.created).toHaveLength(1);
    expect(r.notes.join(" ")).toMatch(/outside the week/);
  });

  it("asks the planner again once if its first reply is not usable", async () => {
    const planFn = vi.fn().mockResolvedValueOnce("Sure, here you go!").mockResolvedValueOnce(FULL);
    const { d } = deps(FULL, { plan: planFn });
    const r = await planWeekFromTranscript(args, d, fixed);
    expect(planFn).toHaveBeenCalledTimes(2);
    expect(r.created).toHaveLength(5);
  });

  it("carries on with the rest when one post cannot be written, and names it", async () => {
    let n = 0;
    const { d } = deps(FULL, {
      write: vi.fn(async (_pt, it) => {
        if (++n === 2) throw new Error("writer down");
        return { body: `Post ${it.brief}`, caption: "c", hashtags: [], altText: "", warnings: [], provider: "gemini" };
      }),
    });
    const r = await planWeekFromTranscript(args, d, fixed);
    expect(r.created).toHaveLength(4);
    expect(r.notes.join(" ")).toMatch(/could not be written just now/);
  });

  it("passes writer warnings through to the draft", async () => {
    const { d } = deps(plan([item("2026-10-21", "event", "Wine tasting")]), {
      write: vi.fn(async () => ({ body: "x", caption: "x", hashtags: [], altText: "", warnings: ["Please check 8pm: it was not in what you gave us."], provider: "gemini" })),
    });
    const r = await planWeekFromTranscript(args, d, fixed);
    expect(r.created[0].warnings[0]).toMatch(/check 8pm/);
  });
});
