import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { MockInstance } from "vitest";
import type { ContentGenerationOutput } from "@/lib/providers";

/**
 * Quick Post reads the company blueprint before it writes. It once selected a
 * column that does not exist (blueprint_text, where the real one is
 * blueprint_content) and discarded the error, so every post was written with an
 * empty blueprint and nothing said so.
 *
 * The fake client answers the blueprint query the way PostgREST does, so these
 * tests fail for the real reason: an unknown column is an error, .single() on no
 * row is an error, and .maybeSingle() on no row is not.
 */

const h = vi.hoisted(() => ({
  generate: vi.fn(),
  queries: [] as { table: string; selected: string | null; eq: Record<string, unknown> }[],
  company: {} as Record<string, unknown>,
  blueprintRow: null as { blueprint_content: string } | null,
  blueprintError: null as { code: string; message: string } | null,
  blueprintColumns: [
    "id",
    "company_id",
    "version",
    "blueprint_content",
    "derived_source_context",
    "derived_brand_context",
    "is_active",
    "created_at",
    "updated_at",
  ],
}));

function answer(query: { table: string; selected: string | null }, mode: "single" | "maybeSingle") {
  if (query.table === "companies") return { data: h.company, error: null };
  if (query.table !== "company_blueprints") return { data: null, error: null };

  const unknownColumn = (query.selected ?? "*")
    .split(",")
    .map((column) => column.trim())
    .find((column) => column !== "*" && !h.blueprintColumns.includes(column));
  if (unknownColumn) {
    return { data: null, error: { code: "42703", message: `column company_blueprints.${unknownColumn} does not exist` } };
  }
  if (h.blueprintError) return { data: null, error: h.blueprintError };
  if (h.blueprintRow) return { data: h.blueprintRow, error: null };
  return mode === "single"
    ? { data: null, error: { code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned" } }
    : { data: null, error: null };
}

vi.mock("@/lib/supabase/admin", () => ({
  requireCompanyUser: vi.fn(async () => ({ id: "user-1" })),
  createAdminSupabaseClient: async () => ({
    from: (table: string) => {
      const query = { table, selected: null as string | null, eq: {} as Record<string, unknown> };
      h.queries.push(query);
      const chain: Record<string, unknown> = {};
      chain.select = (columns: string) => {
        query.selected = columns;
        return chain;
      };
      chain.eq = (column: string, value: unknown) => {
        query.eq[column] = value;
        return chain;
      };
      for (const m of ["is", "order", "limit"]) chain[m] = () => chain;
      chain.single = async () => answer(query, "single");
      chain.maybeSingle = async () => answer(query, "maybeSingle");
      chain.then = (resolve: (v: unknown) => void) => resolve({ data: [], error: null });
      return chain;
    },
  }),
}));

vi.mock("@/lib/providers", () => ({
  getContentProvider: vi.fn(async () => ({ provider: { generate: h.generate } })),
  getImageProvider: vi.fn(),
  resolveProvider: vi.fn(async () => null),
}));

vi.mock("@/lib/utils/plan-limits", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/utils/plan-limits")>();
  return {
    ...actual,
    checkPostLimit: vi.fn(async () => ({ allowed: true, used: 0, limit: 999, remaining: 999 })),
  };
});

vi.mock("@/lib/generation/content-intelligence", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/generation/content-intelligence")>();
  return {
    ...actual,
    runPostGenerationGates: vi.fn(async () => []),
  };
});

vi.mock("@/lib/image/quote-card", () => ({ generateQuoteCard: vi.fn(), QUOTE_CARD_COLORS: {} }));
vi.mock("@/lib/image/carousel", () => ({ generateCarousel: vi.fn() }));
vi.mock("@/lib/image/scene-quote", () => ({ generateSceneQuote: vi.fn(), getScenePrompt: vi.fn() }));

import { POST } from "./route";

const req = (body: unknown) =>
  new Request("http://localhost/api/generate/quick", { method: "POST", body: JSON.stringify(body) });

const validRequest = {
  companyId: "c1",
  topic: "A topic",
  postTypeSlug: "poll_question",
  platform: "linkedin",
};

const draftOutput = (markdownBody: string): ContentGenerationOutput => ({
  title: "A Working Title",
  markdownBody,
  firstComment: null,
  wordCount: markdownBody.split(/\s+/).filter(Boolean).length,
  postType: "poll_question",
  imagePrompt: null,
  assets: [],
});

let errorSpy: MockInstance;

beforeEach(() => {
  h.queries.length = 0;
  h.company = { id: "c1", plan: "pro", industry: "healthcare", spokesperson_name: "Sam", description: null };
  h.blueprintRow = null;
  h.blueprintError = null;
  h.generate.mockReset();
  h.generate.mockResolvedValue(draftOutput("A hook line.\n\nBody."));
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  errorSpy.mockRestore();
});

describe("POST /api/generate/quick: the company blueprint", () => {
  it("sends the company's active blueprint to the writer", async () => {
    h.blueprintRow = { blueprint_content: "The active blueprint text." };

    const res = await POST(req(validRequest));
    const json = await res.json();
    expect(res.status, JSON.stringify(json)).toBe(200);

    expect(h.generate).toHaveBeenCalledTimes(1);
    expect(h.generate).toHaveBeenCalledWith(expect.objectContaining({ blueprintContent: "The active blueprint text." }));

    const read = h.queries.find((q) => q.table === "company_blueprints");
    expect(read?.eq).toMatchObject({ company_id: "c1", is_active: true });
  });

  it("stops with an error and writes nothing when the blueprint read fails", async () => {
    h.blueprintError = { code: "08006", message: "connection failure" };

    const res = await POST(req(validRequest));
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toMatch(/blueprint/i);
    expect(h.generate).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("c1"), h.blueprintError);
  });

  it("still writes for a company with no active blueprint", async () => {
    const res = await POST(req(validRequest));
    const json = await res.json();
    expect(res.status, JSON.stringify(json)).toBe(200);

    expect(h.generate).toHaveBeenCalledTimes(1);
    expect(h.generate).toHaveBeenCalledWith(expect.objectContaining({ blueprintContent: "" }));
  });
});
