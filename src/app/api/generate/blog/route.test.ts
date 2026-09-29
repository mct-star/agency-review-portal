import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ContentGenerationOutput } from "@/lib/providers";
import type { ValidationResult } from "@/lib/generation/quality-tests";
import type { GateResult } from "@/lib/generation/content-intelligence";

/**
 * The containment fix (29 Sept 2026): a blog that fails a critical quality
 * test or a critical gate must never be saved. On 28 Sept one was, because
 * the route computed these results and then discarded them.
 */

const inserts: Array<{ table: string; row: Record<string, unknown> }> = [];
const updates: Array<{ table: string; patch: Record<string, unknown> }> = [];
let company: Record<string, unknown>;
let generated: {
  output: ContentGenerationOutput;
  validation: ValidationResult;
  iterations: number;
  fixHistory: { iteration: number; failureCount: number; failures: string[] }[];
};
let gatesToReturn: GateResult[];

vi.mock("@/lib/supabase/admin", () => ({
  requireAdmin: vi.fn(async () => ({ id: "admin-1" })),
  createAdminSupabaseClient: async () => ({
    from: (table: string) => {
      const chain: Record<string, unknown> = {};
      for (const m of ["select", "eq", "order", "limit"]) chain[m] = () => chain;
      chain.maybeSingle = async () => {
        if (table === "company_blueprints") {
          return { data: { blueprint_content: "The blueprint.", derived_source_context: null, derived_brand_context: null }, error: null };
        }
        if (table === "post_types") {
          return { data: { slug: "blog_article", label: "Blog Article (Full)", template_instructions: "SECTION PLAN...", word_count_min: 1800 }, error: null };
        }
        if (table === "company_voice_profiles") return { data: null, error: null };
        if (table === "weeks") return { data: { id: "week-0", week_number: 0 }, error: null };
        return { data: null, error: null };
      };
      chain.single = async () => {
        if (table === "companies") return { data: company, error: null };
        return { data: null, error: null };
      };
      chain.then = (resolve: (v: unknown) => void) => resolve({ data: [], error: null });
      chain.insert = (row: Record<string, unknown>) => {
        inserts.push({ table, row });
        return {
          select: () => ({ single: async () => ({ data: { id: "piece-1" }, error: null }) }),
          then: (resolve: (v: unknown) => void) => resolve({ error: null }),
        };
      };
      chain.update = (patch: Record<string, unknown>) => { updates.push({ table, patch }); return { eq: async () => ({ error: null }) }; };
      return chain;
    },
  }),
}));

vi.mock("@/lib/providers", () => ({
  getContentProvider: vi.fn(async () => ({ provider: { generate: vi.fn() } })),
  resolveProvider: vi.fn(async () => null),
}));

vi.mock("@/lib/generation/validated-generator", () => ({
  generateWithValidation: vi.fn(async () => generated),
}));

vi.mock("@/lib/generation/content-intelligence", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/generation/content-intelligence")>();
  return {
    ...actual,
    buildPreGenerationContext: vi.fn(actual.buildPreGenerationContext),
    runPostGenerationGates: vi.fn(async () => gatesToReturn),
  };
});

import { POST } from "./route";
import { runPostGenerationGates } from "@/lib/generation/content-intelligence";

const req = (body: unknown) => new Request("http://localhost/api/generate/blog", { method: "POST", body: JSON.stringify(body) });

const validRequest = {
  companyId: "c1",
  topicTitle: "Why hospital procurement teams need a demand generation strategy",
  pillar: "P1",
  audienceTheme: "A",
  brandPillar: "experience",
  wordCountMax: 2200,
};

const draftOutput = (markdownBody: string): ContentGenerationOutput => ({
  title: "A Working Title",
  markdownBody,
  firstComment: null,
  wordCount: markdownBody.split(/\s+/).filter(Boolean).length,
  postType: "blog_article",
  imagePrompt: null,
  assets: [],
});

const passingValidation: ValidationResult = {
  allPassed: true,
  criticalFailures: [],
  highFailures: [],
  allResults: [],
  fixInstructions: "",
};

beforeEach(() => {
  inserts.length = 0;
  updates.length = 0;
  company = { id: "c1", industry: "healthcare", spokesperson_name: "Michael", description: null };
  gatesToReturn = [];
  generated = {
    output: draftOutput("An opening line about hospital procurement.\n\nMore body text here."),
    validation: passingValidation,
    iterations: 1,
    fixHistory: [],
  };
});

describe("POST /api/generate/blog: critical failures are never saved", () => {
  it("refuses a critical quality-test failure with 422, the failures and the draft, and saves nothing", async () => {
    const body = "This is a robust way to talk about patient engagement.";
    generated.output = draftOutput(body);
    generated.validation = {
      allPassed: false,
      criticalFailures: [{ testId: "C5_banned_vocab", testName: "Banned Vocabulary (C5)", passed: false, message: 'Found 1 banned word(s): "robust"', severity: "critical" }],
      highFailures: [],
      allResults: [],
      fixInstructions: "fix it",
    };

    const res = await POST(req(validRequest));
    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.error).toBeTruthy();
    expect(json.failures.some((f: string) => f.includes("robust"))).toBe(true);
    expect(json.gates).toEqual([]);
    expect(json.draft).toEqual({ title: "A Working Title", markdownBody: body, wordCount: generated.output.wordCount });

    expect(inserts.filter((i) => i.table === "content_pieces")).toHaveLength(0);
    expect(inserts.filter((i) => i.table === "content_assets")).toHaveLength(0);
    expect(updates.filter((u) => u.table === "topic_bank")).toHaveLength(0);
  });

  it("refuses a critical gate failure the same way, even when the quality tests all pass", async () => {
    gatesToReturn = [
      { gate: "healthcare_specificity", passed: false, severity: "critical", explanation: "Could be any industry.", fixInstruction: "Add healthcare detail." },
    ];

    const res = await POST(req(validRequest));
    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.failures.some((f: string) => f.includes("healthcare_specificity"))).toBe(true);
    expect(json.gates).toEqual(gatesToReturn);
    expect(inserts.filter((i) => i.table === "content_pieces")).toHaveLength(0);
  });
});

describe("POST /api/generate/blog: high-severity failures save as pending, with warnings", () => {
  it("saves the piece and returns warnings when only high-severity items fail", async () => {
    generated.validation = {
      allPassed: false,
      criticalFailures: [],
      highFailures: [{ testId: "title_format", testName: "Title Format", passed: false, message: "Title contains a colon.", severity: "high" }],
      allResults: [],
      fixInstructions: "",
    };
    gatesToReturn = [
      { gate: "ai_voice_detection", passed: false, severity: "high", explanation: "Banned AI words: delve", fixInstruction: "Remove delve." },
    ];

    const res = await POST(req(validRequest));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.pieceId).toBe("piece-1");
    expect(json.warnings).toEqual(
      expect.arrayContaining([expect.stringContaining("Title contains a colon"), expect.stringContaining("Banned AI words: delve")])
    );

    const piece = inserts.find((i) => i.table === "content_pieces")!.row;
    expect(piece).toMatchObject({ approval_status: "pending" });
  });
});

describe("POST /api/generate/blog: a fully passing article saves as today", () => {
  it("saves the piece with no warnings when everything passes", async () => {
    const res = await POST(req(validRequest));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.pieceId).toBe("piece-1");
    expect(json.qualityPassed).toBe(true);
    expect(json.warnings).toEqual([]);
    expect(inserts.filter((i) => i.table === "content_pieces")).toHaveLength(1);
  });

  it("computes isHealthcareCompany from the company's industry, not a hard-coded true", async () => {
    company = { id: "c1", industry: "fintech", spokesperson_name: "Michael", description: null };
    await POST(req(validRequest));
    const calls = vi.mocked(runPostGenerationGates).mock.calls;
    expect(calls[0][0].isHealthcareCompany).toBe(false);
  });

  it("still passes isHealthcareCompany true for a healthcare company", async () => {
    await POST(req(validRequest));
    const calls = vi.mocked(runPostGenerationGates).mock.calls;
    expect(calls[0][0].isHealthcareCompany).toBe(true);
  });
});
