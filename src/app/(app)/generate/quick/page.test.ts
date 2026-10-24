import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { fakeSupabase } from "@/test/fake-supabase";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const state = vi.hoisted(() => ({ profile: { role: "admin", company_id: null } as { role: string; company_id: string | null }, fake: null as unknown as ReturnType<typeof fakeSupabase>, adminFake: null as unknown as ReturnType<typeof fakeSupabase> }));
vi.mock("@/lib/supabase/server", () => ({ getUserProfile: async () => state.profile, createServerSupabaseClient: async () => state.fake.client }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminSupabaseClient: async () => state.adminFake.client }));
vi.mock("@/components/generate/QuickGenerate", () => ({ default: (props: { initialCompanyId?: string; initialScheduledDate?: string; initialScheduledTime?: string; initialPlanningError?: string; spokespersons?: Array<{ name: string; isPrimary: boolean }> }) => `Quick company ${props.initialCompanyId || "default"} date ${props.initialScheduledDate || "none"} time ${props.initialScheduledTime || "none"} error ${props.initialPlanningError || "none"} people ${props.spokespersons?.map(p => `${p.name}${p.isPrimary ? " (Primary)" : ""}`).join(", ") || "none"}` }));
vi.mock("@/components/hospitality/HospitalityQuickPost", () => ({ default: (props: { companyId: string; initialDate?: string; initialTime?: string }) => `Venue company ${props.companyId} date ${props.initialDate || "none"} time ${props.initialTime || "none"}` }));
import QuickGeneratePage from "./page";

beforeEach(() => {
  state.profile = { role: "admin", company_id: null };
  state.fake = fakeSupabase({ companies: (calls) => {
    const pack = calls.some((call) => call.method === "select" && call.args[0] === "id, name, post_pack");
    return { data: pack ? [{ id: A, name: "Alphabetical first", post_pack: "b2b" }, { id: B, name: "Selected second", post_pack: "b2b" }] : [{ id: A, name: "Alphabetical first" }, { id: B, name: "Selected second" }] };
  } });
  state.adminFake = fakeSupabase({ company_spokespersons: { data: [] } });
});

describe("the setup to first-post handoff", () => {
  it("passes the selected company to the B2B writer instead of the first alphabetical company", async () => {
    const html = renderToStaticMarkup(await QuickGeneratePage({ searchParams: Promise.resolve({ company: B }) }));
    expect(html).toContain(`Quick company ${B}`);
  });

  it("retains compatibility with companyId links", async () => {
    const html = renderToStaticMarkup(await QuickGeneratePage({ searchParams: Promise.resolve({ companyId: B }) }));
    expect(html).toContain(`Quick company ${B}`);
  });

  it("opens the venue writer for the selected hospitality company, including as admin", async () => {
    state.fake = fakeSupabase({ companies: { data: [{ id: A, name: "Other company", post_pack: "b2b" }, { id: B, name: "Example venue", post_pack: "hospitality" }] }, company_spokespersons: { data: [] } });
    const html = renderToStaticMarkup(await QuickGeneratePage({ searchParams: Promise.resolve({ company: B }) }));
    expect(html).toContain(`Venue company ${B}`);
    expect(html).not.toContain("Quick company");
  });

  it("cannot point a company user at another company through the query string", async () => {
    state.profile = { role: "client", company_id: A };
    state.fake = fakeSupabase({ companies: (calls) => ({ data: calls.some((call) => call.method === "single") ? { id: A, name: "Own company" } : [{ id: A, name: "Own company", post_pack: "b2b" }] }), company_spokespersons: { data: [] } });
    const html = renderToStaticMarkup(await QuickGeneratePage({ searchParams: Promise.resolve({ company: B }) }));
    expect(html).not.toContain(B);
    expect(html).toContain("Quick company default");
    expect(state.fake.calls).toContainEqual({ table: "companies", method: "eq", args: ["id", A] });
  });

  it("loads the signed-in company's primary spokesperson through the tenant-scoped server client", async () => {
    state.profile = { role: "client", company_id: A };
    state.fake = fakeSupabase({ companies: (calls) => ({ data: calls.some((call) => call.method === "single") ? { id: A, name: "Own company" } : [{ id: A, name: "Own company", post_pack: "b2b" }] }) });
    state.adminFake = fakeSupabase({ company_spokespersons: { data: [{ id: "andrew", company_id: A, name: "Andrew", tagline: null, profile_picture_url: null, is_primary: true }] } });

    const html = renderToStaticMarkup(await QuickGeneratePage({ searchParams: Promise.resolve({}) }));

    expect(html).toContain("Andrew (Primary)");
    expect(state.adminFake.calls).toContainEqual({ table: "company_spokespersons", method: "in", args: ["company_id", [A]] });
  });

  it("passes the exact calendar date and time to the authorised company's writer", async () => {
    const html = renderToStaticMarkup(await QuickGeneratePage({ searchParams: Promise.resolve({ company: B, date: "2027-01-01", time: "16:45:00" }) }));
    expect(html).toContain(`Quick company ${B} date 2027-01-01 time 16:45 error none`);
  });

  it("surfaces invalid dates instead of silently saving an unscheduled draft", async () => {
    const html = renderToStaticMarkup(await QuickGeneratePage({ searchParams: Promise.resolve({ company: B, date: "2027-02-30", time: "16:45" }) }));
    expect(html).toContain("error The planned date or time is invalid.");
  });

  it("also retains the chosen date in the venue writer", async () => {
    state.fake = fakeSupabase({ companies: { data: [{ id: B, name: "Example venue", post_pack: "hospitality" }] }, company_spokespersons: { data: [] } });
    const html = renderToStaticMarkup(await QuickGeneratePage({ searchParams: Promise.resolve({ company: B, date: "2027-01-01", time: "16:45" }) }));
    expect(html).toContain(`Venue company ${B} date 2027-01-01 time 16:45`);
  });

  it("keeps a planned staff-only format visible and returns the client to the same company and date", async () => {
    state.profile = { role: "client", company_id: A };
    state.fake = fakeSupabase({ companies: (calls) => ({ data: calls.some((call) => call.method === "single") ? { id: A, name: "Own company" } : [{ id: A, name: "Own company", post_pack: "b2b" }] }), company_spokespersons: { data: [] } });
    const html = renderToStaticMarkup(await QuickGeneratePage({ searchParams: Promise.resolve({ company: A, date: "2027-01-01", time: "16:45", postType: "meme" }) }));
    expect(html).toContain("This format needs AGENCY production");
    expect(html).toContain("1 January 2027 at 16:45");
    expect(html).not.toContain("Quick company");
    expect(html).toContain(`href="/calendar?companyId=${A}&amp;date=2027-01-01"`);
  });
});
