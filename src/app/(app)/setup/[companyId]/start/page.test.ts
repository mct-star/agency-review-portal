import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { fakeSupabase } from "@/test/fake-supabase";

const COMPANY = "11111111-1111-4111-8111-111111111111";
const state = vi.hoisted(() => ({
  profile: { id: "user", role: "admin", company_id: null as string | null },
  fake: null as unknown as ReturnType<typeof fakeSupabase>,
}));
vi.mock("@/lib/supabase/server", () => ({
  getUserProfile: async () => state.profile,
  createServerSupabaseClient: async () => ({ ...state.fake.client, auth: { getUser: async () => ({ data: { user: { user_metadata: {} } } }) } }),
}));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("not found"); }, redirect: (path: string) => { throw new Error(`redirect:${path}`); } }));
vi.mock("@/lib/onboarding/readiness", () => ({
  loadSetupReadiness: async () => ({ brand: true, voice: true, connections: false, unavailable: false }),
  nextSetupStep: () => "connections",
}));
vi.mock("@/components/onboarding/WorkspaceSetup", () => ({ default: ({ company }: { company: { name: string; blog_base_url: string } }) => `${company.name} ${company.blog_base_url}` }));
import StartSetupPage from "./page";

beforeEach(() => {
  state.profile = { id: "user", role: "admin", company_id: null };
  // The live companies schema stores the website in blog_base_url.
  const company = { id: COMPANY, name: "Example company", description: "Example", blog_base_url: "https://example.com", post_pack: "b2b" };
  state.fake = fakeSupabase({ companies: (calls) => {
    const columns = String(calls.find((call) => call.method === "select")?.args[0]).split(",").map((column) => column.trim());
    return columns.every((column) => column in company)
      ? { data: company }
      : { data: null, error: { message: "column does not exist" } };
  } });
});

describe("guided setup's saved company contract", () => {
  it("loads the saved website using the deployed companies schema", async () => {
    const html = renderToStaticMarkup(await StartSetupPage({ params: Promise.resolve({ companyId: COMPANY }) }));
    expect(html).toContain("Example company https://example.com");
    expect(state.fake.calls).toContainEqual({ table: "companies", method: "eq", args: ["id", COMPANY] });
  });

  it("does not turn a failed database read into a missing company", async () => {
    state.fake = fakeSupabase({ companies: { error: { message: "read failed" } } });
    await expect(StartSetupPage({ params: Promise.resolve({ companyId: COMPANY }) })).rejects.toThrow("Workspace setup could not be loaded");
  });

  it("refuses another company's setup before querying it", async () => {
    state.profile = { id: "user", role: "client", company_id: "another-company" };
    await expect(StartSetupPage({ params: Promise.resolve({ companyId: COMPANY }) })).rejects.toThrow("redirect:/home");
    expect(state.fake.calls).toHaveLength(0);
  });
});
