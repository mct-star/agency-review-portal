import { describe, it, expect } from "vitest";
import { isHealthcareIndustry } from "./industry";

describe("isHealthcareIndustry", () => {
  it("matches healthcare, medical, pharma, clinic, life science and medtech industries, case-insensitively", () => {
    expect(isHealthcareIndustry("healthcare")).toBe(true);
    expect(isHealthcareIndustry("Healthcare / Life Sciences")).toBe(true);
    expect(isHealthcareIndustry("pharma")).toBe(true);
    expect(isHealthcareIndustry("Pharmaceuticals / Medical Devices")).toBe(true);
    expect(isHealthcareIndustry("MEDTECH")).toBe(true);
    expect(isHealthcareIndustry("Private Clinic Group")).toBe(true);
    expect(isHealthcareIndustry("Life Science Consulting")).toBe(true);
    expect(isHealthcareIndustry("Biomedical Research")).toBe(true);
  });

  it("does not match unrelated industries, or a missing one", () => {
    expect(isHealthcareIndustry("fintech")).toBe(false);
    expect(isHealthcareIndustry("Construction / Property")).toBe(false);
    expect(isHealthcareIndustry("Hospitality / Leisure")).toBe(false);
    expect(isHealthcareIndustry(null)).toBe(false);
    expect(isHealthcareIndustry(undefined)).toBe(false);
    expect(isHealthcareIndustry("")).toBe(false);
  });
});
