import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const COMPANY_ID = "11111111-1111-4111-8111-111111111111";

// A stand-in for Supabase that answers a count by table and filters, and only
// for the company asked about, so a query that forgets its company filter shows up.
type Counts = Record<string, number>;
let counts: Counts = {};
let profile: Record<string, unknown> | null = null;
let countsError = false;
let pendingPieces: Array<{ id: string; week_id: string | null }> | null = null;
let weeks: Array<{ id: string; company_id: string; week_number: number; date_start: string }> = [];

function builder(table: string) {
  const filters: Record<string, unknown> = {};
  const answer = () => {
    const n = table === "content_pieces" && filters.approval_status === "pending" && pendingPieces
      ? pendingPieces.length : counts[`${table}:${filters.status ?? filters.approval_status ?? ""}`] ?? 0;
    const mine = filters.company_id === COMPANY_ID;
    if (table === "weeks") return {
      data: mine ? weeks.filter(w => w.company_id === COMPANY_ID && (filters.ids as string[]).includes(w.id)) : [],
      error: countsError ? { message: "Unavailable" } : null,
    };
    const pieces = table === "content_pieces" && (filters.approval_status === "approved" || filters.approval_status === "pending")
      ? (mine && filters.approval_status === "pending" && pendingPieces
        ? pendingPieces : Array.from({ length: mine ? n : 0 }, (_, index) => ({ id: `p-${index}`, week_id: null }))) : [];
    return { data: pieces, count: mine ? n : 0, error: countsError ? { message: "Unavailable" } : null };
  };
  const b: Record<string, unknown> = {
    select: () => b,
    eq: (col: string, val: unknown) => ((filters[col] = val), b),
    not: () => b,
    in: (col: string, vals: unknown[]) => { if (col === "id") filters.ids = vals; return b; },
    gte: () => b,
    order: () => b,
    limit: () => b,
    single: async () => ({ data: { strategy_completed: false }, error: null }),
    // The latest weather run: none in these tests.
    maybeSingle: async () => ({ data: null, error: null }),
    then: (resolve: (v: unknown) => unknown) => Promise.resolve(answer()).then(resolve),
  };
  return b;
}

// The admin home reads with the service-role client; the same fake answers it.
vi.mock("@/lib/supabase/admin", () => ({
  createAdminSupabaseClient: async () => ({ from: (t: string) => builder(t) }),
}));

vi.mock("@/lib/supabase/server", () => ({
  getUserProfile: async () => profile,
  createServerSupabaseClient: async () => ({ from: (t: string) => builder(t), auth: { getUser: async () => ({ data: { user: { user_metadata: { company_name: "New Example" } } } }) } }),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }) }));

import HomePage from "./page";

const render = async () => renderToStaticMarkup(await HomePage());
const hrefs = (html: string) => [...new Set([...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]))];

const hospitalityCompany = {
  id: COMPANY_ID,
  name: "Lakeside Example",
  post_pack: "hospitality",
  timezone: "Europe/London",
  weather_post_enabled: true,
  weather_post_time: "08:00:00",
  weather_post_for: "today",
  latitude: 51.45,
  longitude: -2.59,
};

beforeEach(() => {
  counts = {};
  profile = null;
  countsError = false;
  pendingPieces = null;
  weeks = [];
});

describe("the home page for a hospitality venue", () => {
  const asClient = (company: Record<string, unknown>) => ({
    id: "u1",
    email: "sam@example.test",
    full_name: "Sam Example",
    role: "client",
    company_id: COMPANY_ID,
    can_publish: false,
    company,
  });

  it("shows what is waiting, three plain actions and the weather line", async () => {
    counts = { "content_pieces:pending": 4, "photo_inventory:pending": 2, "photo_inventory:approved": 11 };
    profile = asClient(hospitalityCompany);
    const html = await render();

    expect(html).toMatch(/Good (morning|afternoon|evening), Sam\./);
    expect(html).toContain("Waiting for you");
    expect(html).toContain("4 posts are waiting for you to approve, and 2 photos from your team to look at.");
    expect(html).toContain("Write a post");
    expect(html).toContain("Talk through the week");
    expect(html).toContain("Add photos");
    expect(html).toContain("11 photos and videos are in your library");
    expect(html).toMatch(/Next weather post: drafted around \d\d:\d\d on [A-Z][a-z]+day \d+ [A-Z][a-z]+, for 08:00 /);

    const links = hrefs(html);
    expect(links).toEqual(expect.arrayContaining(["/approvals", "/generate/quick", "/create/week-interview", "/library"]));
  });

  it("has no strategy banner, no Content Studio and no dashboard link", async () => {
    counts = { "content_pieces:pending": 1 };
    profile = asClient(hospitalityCompany);
    const html = await render();

    for (const gone of [
      "New here?",
      "Build your content strategy",
      "Skip to Quick Generate",
      "Quick Generate",
      "Content Studio",
      "Review Content",
      "View detailed dashboard",
      "LinkedIn",
    ]) {
      expect(html).not.toContain(gone);
    }
    const links = hrefs(html);
    for (const route of ["/strategy", "/generate", "/dashboard", "/review", "/publish"]) expect(links).not.toContain(route);
  });

  it("says one post, not 1 posts, and shows an up-to-date card when nothing is waiting", async () => {
    counts = { "content_pieces:pending": 1 };
    profile = asClient(hospitalityCompany);
    expect(await render()).toContain("1 post is waiting for you to approve.");

    counts = {};
    expect(await render()).toContain("Nothing is waiting. You are up to date.");
  });

  it("leaves the weather line out when the weather post is off", async () => {
    profile = asClient({ ...hospitalityCompany, weather_post_enabled: false });
    expect(await render()).not.toContain("weather post");
  });

  it("counts only its own company's posts and photos", async () => {
    // The fake answers 0 for any query that does not filter on this company.
    counts = { "content_pieces:pending": 9, "photo_inventory:approved": 9 };
    profile = asClient(hospitalityCompany);
    const html = await render();
    expect(html).toContain("9 posts are waiting for you to approve.");
    expect(html).toContain("9 photos and videos are in your library");
  });

  it("never uses a long dash in what it says", async () => {
    counts = { "content_pieces:pending": 2, "photo_inventory:pending": 1, "photo_inventory:approved": 3 };
    profile = asClient(hospitalityCompany);
    expect(await render()).not.toContain(String.fromCharCode(0x2014));
  });
});

describe("the home page for a business-to-business company", () => {
  it("offers setup separately from creation and the three tiles", async () => {
    counts = { "content_pieces:pending": 0 };
    profile = {
      id: "u2",
      email: "pat@example.test",
      full_name: "Pat Example",
      role: "client",
      company_id: COMPANY_ID,
      can_publish: false,
      company: { id: COMPANY_ID, name: "Example Consulting", post_pack: "b2b" },
    };
    const html = await render();
    expect(html).toContain("Finish setup");
    expect(html).toContain(`/setup/${COMPANY_ID}/start`);
    expect(html).not.toContain("New here?");
    expect(html).not.toContain("Build your strategy");
    expect(html).toContain("Create a post");
    expect(html).toContain("Quick Post");
    expect(html).toContain("Content Studio");
    expect(html).toContain("Content Review");
    expect(html).not.toContain("View detailed dashboard");
    expect(html).not.toContain("Talk through the week");
  });

  it("is also what a company with no pack set gets", async () => {
    profile = { id: "u3", email: "x@example.test", full_name: "Xi Example", role: "client", company_id: COMPANY_ID, can_publish: false, company: { id: COMPANY_ID } };
    expect(await render()).toContain("Content Studio");
  });

  it("shows setup on the actual first-login Home destination before a company exists", async () => {
    profile = { id: "new-user", role: "client", company_id: null, full_name: "New Person" };
    const html = await render();
    expect(html).toContain("Set up your workspace");
    expect(html).toContain("New Example");
    expect(html).toContain("Create workspace");
    expect(html).not.toContain("Content Studio");
    expect(html).not.toContain("Build your strategy");
  });

  it("puts approved work ahead of optional strategy setup without offering unauthorised publishing", async () => {
    profile = { id: "returning", role: "client", company_id: COMPANY_ID, company: { id: COMPANY_ID, name: "Example", post_pack: "b2b" } };
    // Counts use the same table-scoped response as the other Home tests.
    counts = { "content_pieces:approved": 2 };
    const html = await render();
    expect(html).toContain("2 approved posts not yet queued.");
    expect(html).toContain("View approved content");
    expect(hrefs(html)).not.toContain("/publish");
    expect(html).not.toContain("Build your strategy");
  });

  it("prioritises review even when the company has no completed strategy", async () => {
    profile = { id: "returning", role: "client", company_id: COMPANY_ID, company: { id: COMPANY_ID, name: "Example", post_pack: "b2b" } };
    counts = { "content_pieces:pending": 2, "content_pieces:approved": 3 };
    const html = await render();
    expect(html).toContain("2 individual posts awaiting review.");
    expect(html).toContain("Review now");
    expect(html).not.toContain("Build your strategy");
  });

  it("counts each standalone draft individually and opens the pending individual review list", async () => {
    profile = { id: "returning", role: "client", company_id: COMPANY_ID, company: { id: COMPANY_ID, post_pack: "b2b" } };
    pendingPieces = [{ id: "draft-a", week_id: "tray" }, { id: "draft-b", week_id: "tray" }];
    weeks = [{ id: "tray", company_id: COMPANY_ID, week_number: 0, date_start: "2026-10-24" }];
    const html = await render();
    expect(html).toContain("2 individual posts awaiting review.");
    expect(html).toContain("2 items are waiting for your review.");
    expect(html).toMatch(/Awaiting review<\/dt><dd[^>]*>2<\/dd>/);
    expect(hrefs(html)).toContain("/review?status=pending");
    expect(html).not.toContain("w/c 24 Oct");
  });

  it("preserves real week labels and grouping beside standalone and legacy individual drafts", async () => {
    profile = { id: "returning", role: "client", company_id: COMPANY_ID, company: { id: COMPANY_ID, post_pack: "b2b" } };
    pendingPieces = [
      { id: "draft-a", week_id: "tray" }, { id: "draft-b", week_id: "tray" }, { id: "legacy", week_id: null },
      { id: "planned-a", week_id: "planned" }, { id: "planned-b", week_id: "planned" },
    ];
    weeks = [
      { id: "tray", company_id: COMPANY_ID, week_number: 0, date_start: "2026-10-24" },
      { id: "planned", company_id: COMPANY_ID, week_number: 44, date_start: "2026-10-26" },
      { id: "foreign", company_id: "another-company", week_number: 45, date_start: "2026-11-02" },
    ];
    const html = await render();
    expect(html).toContain("3 individual posts and w/c 26 Oct awaiting review.");
    expect(html).toMatch(/Awaiting review<\/dt><dd[^>]*>4<\/dd>/);
    expect(html).not.toContain("w/c 24 Oct");
    expect(html).not.toContain("w/c 2 Nov");
  });

  it("keeps the dated-week review action when only a real batch awaits review", async () => {
    profile = { id: "returning", role: "client", company_id: COMPANY_ID, company: { id: COMPANY_ID, post_pack: "b2b" } };
    pendingPieces = [{ id: "planned-a", week_id: "planned" }, { id: "planned-b", week_id: "planned" }];
    weeks = [{ id: "planned", company_id: COMPANY_ID, week_number: 44, date_start: "2026-10-26" }];
    const html = await render();
    expect(html).toContain("w/c 26 Oct awaiting review.");
    expect(html).toMatch(/Awaiting review<\/dt><dd[^>]*>1<\/dd>/);
    expect(hrefs(html)).not.toContain("/review?status=pending");
  });

  it("shows counts as unavailable if a referenced week cannot be resolved within the company", async () => {
    profile = { id: "returning", role: "client", company_id: COMPANY_ID, company: { id: COMPANY_ID, post_pack: "b2b" } };
    pendingPieces = [{ id: "draft-a", week_id: "foreign" }];
    weeks = [{ id: "foreign", company_id: "another-company", week_number: 0, date_start: "2026-10-24" }];
    const html = await render();
    expect(html).toContain("Some content counts could not be checked.");
    expect(html).not.toContain("w/c 24 Oct");
    expect(html).not.toContain("All caught up");
  });

  it("does not invent a zero or claim readiness after a count failure", async () => {
    profile = { id: "returning", role: "client", company_id: COMPANY_ID, company: { id: COMPANY_ID, name: "Example", post_pack: "b2b" } };
    countsError = true;
    const html = await render();
    expect(html).toContain("Some content counts could not be checked.");
    expect(html).toContain("Unavailable");
    expect(html).not.toContain("All caught up");
    expect(html).not.toContain("not yet queued.");
  });

  it("gives the operator the four panels, even on a hospitality company", async () => {
    profile = { id: "u4", email: "admin@example.test", full_name: "Ann Admin", role: "admin", company_id: COMPANY_ID, can_publish: true, company: { id: COMPANY_ID, post_pack: "hospitality" } };
    const html = await render();
    for (const panel of ["Waiting", "Clients", "Jobs", "Tickets"]) expect(html).toContain(panel);
    expect(html).not.toContain("Talk through the week");
    expect(html).not.toContain("New here? Build a strategy");
  });
});
