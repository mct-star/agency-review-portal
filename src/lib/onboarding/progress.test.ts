import { describe, expect, it } from "vitest";
import { progressForCompany, setupMetadata, setupPreferences, stepsForPack } from "./progress";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";

describe("personal setup preferences", () => {
  it("resumes only the selected company and preserves another company's position", () => {
    const first = { workspace_setup: setupMetadata({}, A, "connections") };
    expect(progressForCompany(first, A, false)).toEqual({ step: "connections" });
    expect(progressForCompany(first, B, false)).toBeNull();
    const next = { workspace_setup: setupMetadata(first, B, "brand") };
    expect(progressForCompany(next, A, false)).toEqual({ step: "connections" });
    expect(progressForCompany(next, B, false)).toEqual({ step: "brand" });
  });

  it("ignores invalid, old-version and unrecognised preferences", () => {
    for (const input of [null, [], { workspace_setup: null }, { workspace_setup: { version: 2, companies: { [A]: { step: "connections" } } } }]) {
      expect(setupPreferences(input)).toEqual({});
    }
    expect(setupPreferences({ workspace_setup: { version: 1, companies: { [A]: { step: "admin" }, other: { step: "brand" } } } })).toEqual({});
  });

  it("never restores a business writing-voice step for a hospitality venue", () => {
    const metadata = { workspace_setup: setupMetadata({}, A, "voice") };
    expect(progressForCompany(metadata, A, true)).toBeNull();
    expect(stepsForPack(true)).toEqual(["brand", "connections", "create"]);
  });
});
