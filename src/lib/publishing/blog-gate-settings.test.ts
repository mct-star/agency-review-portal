import { describe, expect, it } from "vitest";
import { fakeSupabase, type RecordedCall } from "@/test/fake-supabase";
import { DEFAULT_BLOG_GATE_SETTINGS } from "./blog-gate";
import { BLOG_GATE_ENFORCE_INVALID, BLOG_GATE_SETTINGS_UNREADABLE, resolveBlogGateSettings } from "./blog-gate-settings";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";

/** A config table holding rows per company; it answers only a query filtered to that company. */
const configs = (rows: Record<string, unknown>) => fakeSupabase({
  company_api_configs: (calls: RecordedCall[]) => {
    const company = calls.find(c => c.method === "eq" && c.args[0] === "company_id")?.args[1] as string | undefined;
    return { data: company && company in rows ? { provider_settings: rows[company] } : null };
  },
});

describe("resolveBlogGateSettings", () => {
  it("gives the defaults, not enforced, when the company has no row", async () => {
    const { client } = configs({});
    expect(await resolveBlogGateSettings(client, A)).toEqual({ settings: { ...DEFAULT_BLOG_GATE_SETTINGS, enforceImageChecks: false } });
  });

  it("reads the company's own row, filtered by company, category, provider and active", async () => {
    const fake = configs({ [A]: { photographTreatment: "duotone", inlineImageWordLimit: 700, requireShareCard: false, enforceImageChecks: true } });
    expect(await resolveBlogGateSettings(fake.client, A)).toEqual({ settings: {
      photographTreatment: "duotone", inlineImageWordLimit: 700, requireShareCard: false, enforceImageChecks: true,
    } });
    const eqs = fake.calls.filter(c => c.method === "eq").map(c => c.args);
    expect(eqs).toEqual([["company_id", A], ["service_category", "blog_publishing"], ["provider", "blog_gate"], ["is_active", true]]);
  });

  it("never uses another company's row", async () => {
    const { client } = configs({ [B]: { photographTreatment: "duotone", enforceImageChecks: true } });
    expect(await resolveBlogGateSettings(client, A)).toEqual({ settings: { ...DEFAULT_BLOG_GATE_SETTINGS, enforceImageChecks: false } });
  });

  // Changed on purpose (15 Nov 2026): this row used to carry
  // enforceImageChecks "true" and fall back to not enforcing. A non-boolean
  // enforceImageChecks is now a refusal (tested below), so this row leaves
  // the key out and still checks the field-by-field fallback.
  it("falls back field by field on bad values", async () => {
    const { client } = configs({ [A]: { photographTreatment: 4, inlineImageWordLimit: -1, requireShareCard: "yes" } });
    expect(await resolveBlogGateSettings(client, A)).toEqual({ settings: { ...DEFAULT_BLOG_GATE_SETTINGS, enforceImageChecks: false } });
  });

  it.each([["the string \"true\"", "true"], ["the number 1", 1], ["null", null], ["the string \"false\"", "false"]])(
    "refuses when enforceImageChecks is %s, not true or false", async (_name, value) => {
      const { client } = configs({ [A]: { enforceImageChecks: value } });
      expect(await resolveBlogGateSettings(client, A)).toEqual({ refusal: BLOG_GATE_ENFORCE_INVALID });
    });

  it("treats false as not enforcing", async () => {
    const { client } = configs({ [A]: { enforceImageChecks: false } });
    expect(await resolveBlogGateSettings(client, A)).toEqual({ settings: { ...DEFAULT_BLOG_GATE_SETTINGS, enforceImageChecks: false } });
  });

  // Also changed on purpose: this row used to carry enforceImageChecks 1, now a refusal.
  it("keeps the good fields of a partly bad row", async () => {
    const { client } = configs({ [A]: { photographTreatment: "mono", inlineImageWordLimit: "lots" } });
    expect(await resolveBlogGateSettings(client, A)).toEqual({ settings: {
      ...DEFAULT_BLOG_GATE_SETTINGS, photographTreatment: "mono", enforceImageChecks: false,
    } });
  });

  it("gives the defaults when provider_settings is not an object", async () => {
    const { client } = configs({ [A]: ["not", "an", "object"] });
    expect(await resolveBlogGateSettings(client, A)).toEqual({ settings: { ...DEFAULT_BLOG_GATE_SETTINGS, enforceImageChecks: false } });
  });

  it("refuses, rather than giving the defaults, when the row cannot be read", async () => {
    const { client } = fakeSupabase({ company_api_configs: { data: null, error: { message: "boom" } } });
    expect(await resolveBlogGateSettings(client, A)).toEqual({ refusal: BLOG_GATE_SETTINGS_UNREADABLE });
  });
});
