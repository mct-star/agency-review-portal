import { describe, expect, it } from "vitest";
import { FEATURE_PLANS, planAllows } from "./plan-gate";

describe("planAllows", () => {
  it("lets Pro and Agency use the Pro features", () => {
    for (const plan of ["pro", "agency"]) {
      expect(planAllows(plan, "calendar")).toBe(true);
      expect(planAllows(plan, "publish")).toBe(true);
      expect(planAllows(plan, "analytics")).toBe(true);
    }
  });
  it("keeps Free and Starter out of the Pro features", () => {
    for (const plan of ["free", "starter"]) {
      expect(planAllows(plan, "calendar")).toBe(false);
      expect(planAllows(plan, "weeklyPlanner")).toBe(false);
      expect(planAllows(plan, "compliance")).toBe(false);
      expect(planAllows(plan, "publish")).toBe(false);
      expect(planAllows(plan, "analytics")).toBe(false);
      expect(planAllows(plan, "connections")).toBe(false);
    }
  });
  it("opens Week Batch from Starter", () => {
    expect(FEATURE_PLANS.weekBatch).toBe("starter");
    expect(planAllows("free", "weekBatch")).toBe(false);
    expect(planAllows("starter", "weekBatch")).toBe(true);
  });
  it("treats an unknown plan as Free", () => {
    expect(planAllows("platinum", "weekBatch")).toBe(false);
    expect(planAllows("", "calendar")).toBe(false);
  });
});
