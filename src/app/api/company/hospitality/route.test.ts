import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase } from "@/test/fake-supabase";

const state = vi.hoisted(() => ({ role: "client" }));
const companyId = "11111111-1111-4111-8111-111111111111";
let db: ReturnType<typeof fakeSupabase>;
vi.mock("@/lib/media/access", () => ({ authoriseCompany: async () => ({ ok: true, profile: { role: state.role } }) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminSupabaseClient: async () => db.client }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
import { PUT } from "./route";
const request = (fields: Record<string, unknown>) => new Request("https://portal.test/api/company/hospitality", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companyId, ...fields }) });

beforeEach(() => { state.role = "client"; db = fakeSupabase({ companies: { data: { id: companyId } } }); });
describe("operator controls publishing networks", () => {
  it("refuses a company member's network change before writing", async () => {
    expect((await PUT(request({ social_networks: ["youtube", "pinterest"] }))).status).toBe(403);
    expect(db.calls).toEqual([]);
  });
  it("allows an admin and scopes the update to the selected company", async () => {
    state.role = "admin";
    expect((await PUT(request({ social_networks: ["youtube", "pinterest"] }))).status).toBe(200);
    expect(db.calls).toContainEqual({ table: "companies", method: "update", args: [{ social_networks: ["youtube", "pinterest"] }] });
    expect(db.calls).toContainEqual({ table: "companies", method: "eq", args: ["id", companyId] });
  });
  it("continues to allow ordinary venue notes", async () => {
    expect((await PUT(request({ hospitality_settings: { venue_notes: "A Bristol restaurant" } }))).status).toBe(200);
  });
});
