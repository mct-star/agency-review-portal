import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireCompanyUser: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ requireCompanyUser: mocks.requireCompanyUser }));
import { canManageYouTube } from "./oauth";

afterEach(() => vi.clearAllMocks());
describe("YouTube connection management", () => {
  it("requires an admin even when a company member can publish", async () => {
    mocks.requireCompanyUser.mockResolvedValue({ id: "publisher", role: "client", can_publish: true });
    expect((await canManageYouTube("company-a")).reason).toBe("forbidden");
    expect(mocks.requireCompanyUser).toHaveBeenCalledWith("company-a");
  });
  it("allows an authenticated admin to manage the connection", async () => {
    mocks.requireCompanyUser.mockResolvedValue({ id: "operator", role: "admin" });
    expect((await canManageYouTube("company-a")).reason).toBeNull();
  });
});
