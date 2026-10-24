import { createElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { fakeSupabase, type RecordedCall } from "@/test/fake-supabase";

const state = vi.hoisted(() => ({
  spokespersonId: "person-a" as string | null,
  pieceCompany: "company-a",
  personAvatar: "https://example.test/person.jpg" as string | null,
  personCompany: "company-a",
  personTagline: "Co-founder, Example HealthTech" as string | null,
  companyTagline: null as string | null,
  weekNumber: 0,
  calls: [] as RecordedCall[],
  adminCalls: [] as RecordedCall[],
  adminClients: 0,
}));

vi.mock("@/lib/supabase/server", () => ({
  getUserProfile: async () => ({ id: "user-a", role: "client", company_id: "company-a" }),
  createServerSupabaseClient: async () => {
    const fake = fakeSupabase({
      content_pieces: { data: {
        id: "piece-a", company_id: state.pieceCompany, spokesperson_id: state.spokespersonId,
        week_id: "week-a", week: { week_number: state.weekNumber, date_start: "2026-10-24" },
        content_type: "social_post", approval_status: "pending", title: "A useful draft", markdown_body: "Draft text",
      } },
      companies: { data: { spokesperson_name: "Company author", spokesperson_tagline: state.companyTagline, profile_picture_url: "https://example.test/company.jpg" } },
      company_spokespersons: { data: null, error: { message: "permission denied by session RLS" } },
      content_images: { data: [] }, content_assets: { data: [] }, comments: { data: [] },
    });
    state.calls = fake.calls;
    return fake.client;
  },
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminSupabaseClient: async () => {
    state.adminClients++;
    const fake = fakeSupabase({ company_spokespersons: (calls) => {
      const person = { id: "person-a", company_id: state.personCompany, name: "Selected author", tagline: state.personTagline, profile_picture_url: state.personAvatar };
      const matches = calls.filter(c => c.method === "eq").every(c => person[c.args[0] as keyof typeof person] === c.args[1]);
      return { data: matches ? person : null };
    } });
    state.adminCalls = fake.calls;
    return fake.client;
  },
}));
vi.mock("@/components/content/ContentViewTabs", () => ({ default: (props: { authorName: string; authorTagline: string; authorAvatarUrl: string }) => createElement("div", { "data-author": props.authorName, "data-avatar": props.authorAvatarUrl }, props.authorTagline) }));
vi.mock("@/components/content/ApprovalButtons", () => ({ default: () => null }));
vi.mock("@/components/comments/CommentThread", () => ({ default: () => null }));
vi.mock("@/components/comments/CommentForm", () => ({ default: () => null }));
vi.mock("@/components/content/ContentAssets", () => ({ default: () => null }));
vi.mock("@/components/content/BankPicker", () => ({ default: () => null }));
vi.mock("@/components/content/PlatformVariants", () => ({ default: () => null }));
vi.mock("@/components/content/GenerateActions", () => ({ default: () => null }));
vi.mock("@/components/content/WebsitePublishPanel", () => ({ default: () => null }));
vi.mock("@/components/content/DeletePieceButton", () => ({ default: () => null }));

import ContentPiecePage from "./page";
const render = async () => renderToStaticMarkup(await ContentPiecePage({ params: Promise.resolve({ pieceId: "piece-a" }) }));
beforeEach(() => {
  state.spokespersonId = "person-a";
  state.pieceCompany = "company-a";
  state.personAvatar = "https://example.test/person.jpg";
  state.personCompany = "company-a";
  state.personTagline = "Co-founder, Example HealthTech";
  state.companyTagline = null;
  state.weekNumber = 0;
  state.calls = [];
  state.adminCalls = [];
  state.adminClients = 0;
});

describe("client review identity and location", () => {
  it("uses the saved spokesperson's name, tagline and avatar within the draft's company", async () => {
    const html = await render();
    expect(html).toContain('data-author="Selected author"');
    expect(html).toContain('data-avatar="https://example.test/person.jpg"');
    expect(html).toContain("Co-founder, Example HealthTech");
    expect(state.adminClients).toBe(1);
    expect(state.calls.some(c => c.table === "company_spokespersons")).toBe(false);
    expect(state.adminCalls).toContainEqual({ table: "company_spokespersons", method: "eq", args: ["company_id", "company-a"] });
    expect(state.adminCalls).toContainEqual({ table: "company_spokespersons", method: "eq", args: ["id", "person-a"] });
  });

  it("refuses a spokesperson belonging to another company and uses company identity", async () => {
    state.personCompany = "company-b";
    state.companyTagline = "Our saved company tagline";
    const html = await render();
    expect(html).toContain('data-author="Company author"');
    expect(html).toContain("Our saved company tagline");
    expect(html).not.toContain("Selected author");
    expect(html).not.toContain("Co-founder, Example HealthTech");
  });

  it("uses company defaults without querying a spokesperson when none was saved", async () => {
    state.spokespersonId = null;
    const html = await render();
    expect(html).toContain('data-author="Company author"');
    expect(state.adminClients).toBe(0);
    expect(html).not.toContain("Healthcare Demand Generation");
  });

  it("leaves an absent tagline empty instead of adding an unsupported industry claim", async () => {
    state.personTagline = null;
    state.personAvatar = null;
    state.companyTagline = "Another company author tagline";
    const html = await render();
    expect(html).toContain('data-author="Selected author"');
    expect(html).not.toContain("Healthcare Demand Generation");
    expect(html).not.toContain("Another company author tagline");
    expect(html).not.toContain("https://example.test/company.jpg");
    expect(html).not.toContain("data-avatar=");
  });

  it("rejects a foreign piece before creating a privileged client or fetching dependent data", async () => {
    state.pieceCompany = "company-b";
    await expect(render()).rejects.toThrow("NEXT_HTTP_ERROR_FALLBACK;404");
    expect(state.adminClients).toBe(0);
    expect(state.calls.every(c => c.table === "content_pieces")).toBe(true);
  });

  it("keeps Content Review navigation without a dated breadcrumb for standalone storage", async () => {
    const html = await render();
    expect(html).toContain('href="/review"');
    expect(html).not.toContain('href="/review/week-a"');
    expect(html).not.toContain("w/c 24 October");
  });

  it("retains the dated breadcrumb for a real planned week", async () => {
    state.weekNumber = 43;
    const html = await render();
    expect(html).toContain('href="/review/week-a"');
    expect(html).toContain("w/c 24 October");
  });
});
