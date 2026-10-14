import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const COMPANY_ID = "11111111-1111-4111-8111-111111111111";

// A stand-in for Supabase that answers a count by table and filters, and only
// for the company asked about, so a query that forgets its company filter shows up.
type Counts = Record<string, number>;
let counts: Counts = {};
let profile: Record<string, unknown> | null = null;

function builder(table: string) {
  const filters: Record<string, unknown> = {};
  const answer = () => {
    const n = counts[`${table}:${filters.status ?? filters.approval_status ?? ""}`] ?? 0;
    const mine = filters.company_id === COMPANY_ID;
    return { data: [], count: mine ? n : 0, error: null };
  };
  const b: Record<string, unknown> = {
    select: () => b,
    eq: (col: string, val: unknown) => ((filters[col] = val), b),
    in: () => b,
    gte: () => b,
    order: () => b,
    limit: () => b,
    single: async () => ({ data: { strategy_completed: false }, error: null }),
    then: (resolve: (v: unknown) => unknown) => Promise.resolve(answer()).then(resolve),
  };
  return b;
}

vi.mock("@/lib/supabase/server", () => ({
  getUserProfile: async () => profile,
  createServerSupabaseClient: async () => ({ from: (t: string) => builder(t) }),
}));

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
  it("keeps the strategy banner, the three tiles and the dashboard link", async () => {
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
    expect(html).toContain("New here? Build a strategy for best results, or jump straight in.");
    expect(html).toContain("Build your content strategy");
    expect(html).toContain("Skip to Quick Generate");
    expect(html).toContain("Quick Generate");
    expect(html).toContain("Content Studio");
    expect(html).toContain("Review Content");
    expect(html).toContain("View detailed dashboard");
    expect(html).not.toContain("Talk through the week");
  });

  it("is also what a company with no pack set gets", async () => {
    profile = { id: "u3", email: "x@example.test", full_name: "Xi Example", role: "client", company_id: COMPANY_ID, can_publish: false, company: { id: COMPANY_ID } };
    expect(await render()).toContain("Content Studio");
  });

  it("is what the operator sees, even on a hospitality company", async () => {
    profile = { id: "u4", email: "admin@example.test", full_name: "Ann Admin", role: "admin", company_id: COMPANY_ID, can_publish: true, company: { id: COMPANY_ID, post_pack: "hospitality" } };
    expect(await render()).toContain("Content Studio");
  });
});
