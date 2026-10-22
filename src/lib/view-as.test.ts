import { describe, expect, it } from "vitest";
import { VIEW_AS_TTL_SECONDS, signViewAs, verifyViewAs, viewAsSecret } from "./view-as";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";

describe("view-as cookie", () => {
  it("round-trips a company id", async () => {
    const c = await signViewAs(A, "s");
    expect(await verifyViewAs(c, "s")).toBe(A);
  });
  it("rejects tampering, a wrong secret, a bare id and an empty secret", async () => {
    const c = await signViewAs(A, "s");
    const [, exp, sig] = c.split(".");
    expect(await verifyViewAs(`${Buffer.from(B).toString("base64url")}.${exp}.${sig}`, "s")).toBeNull();
    expect(await verifyViewAs(c, "wrong")).toBeNull();
    expect(await verifyViewAs(A, "s")).toBeNull();
    expect(await verifyViewAs(c, "")).toBeNull();
  });
  it("expires after an hour", async () => {
    const t0 = 1_700_000_000_000;
    const c = await signViewAs(A, "s", t0);
    expect(await verifyViewAs(c, "s", t0 + (VIEW_AS_TTL_SECONDS - 1) * 1000)).toBe(A);
    expect(await verifyViewAs(c, "s", t0 + (VIEW_AS_TTL_SECONDS + 1) * 1000)).toBeNull();
  });
  it("refuses a non-uuid and is disabled without a secret", async () => {
    await expect(signViewAs("sam", "s")).rejects.toThrow();
    expect(viewAsSecret({})).toBe("");
    expect(viewAsSecret({ VIEW_AS_SECRET: " x " })).toBe("x");
  });
});
