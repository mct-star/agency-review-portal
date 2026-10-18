import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ContentGenerationInput, ContentGenerationOutput } from "@/lib/providers";
import type { CalendarSlot } from "@/types/database";
import type { ApiProductionJob, ProductionDb } from "./types";
import { productionId } from "./identity";

const mocks = vi.hoisted(() => ({ generate: vi.fn(), render: vi.fn(), validated: vi.fn(), gates: vi.fn() }));
vi.mock("@/lib/providers", () => ({
  getContentProvider: vi.fn(async () => ({ provider: { generate: mocks.generate } })),
}));
vi.mock("./render", () => ({ renderProductionImage: mocks.render }));
vi.mock("@/lib/generation/validated-generator", () => ({ generateWithValidation: mocks.validated }));
vi.mock("@/lib/generation/content-intelligence", () => ({ runPostGenerationGates: mocks.gates }));

import { generatePlannedPiece } from "./generate";

type Row = Record<string, any>;
function makeDb(seed: Record<string, Row[]> = {}) {
  const tables: Record<string, Row[]> = structuredClone(seed);
  const calls: Array<{ table: string; action: string; filters: string[]; values?: Row | Row[] }> = [];
  const fail: Record<string, string> = {};
  const db = { from(table: string) {
    let action = "select";
    let values: Row | Row[] = {};
    let filters: Array<(row: Row) => boolean> = [];
    let labels: string[] = [];
    let one = false;
    const query: any = {
      select() { return query; },
      insert(input: Row | Row[]) { action = "insert"; values = input; return query; },
      upsert(input: Row | Row[]) { action = "upsert"; values = input; return query; },
      update(input: Row) { action = "update"; values = input; return query; },
      eq(key: string, value: unknown) { filters.push(row => row[key] === value); labels.push(`${key}=${String(value)}`); return query; },
      gt(key: string, value: string) { filters.push(row => row[key] != null && row[key] > value); labels.push(`${key}>${value}`); return query; },
      order() { return query; }, limit() { return query; },
      maybeSingle() { one = true; return query.run(); },
      single() { one = true; return query.run(); },
      async run() {
        calls.push({ table, action, filters: [...labels], values: structuredClone(values) });
        tables[table] ||= [];
        if (fail[`${table}:${action}`]) return { data: null, error: { message: fail[`${table}:${action}`] } };
        if (action === "insert" || action === "upsert") {
          const batch = Array.isArray(values) ? values : [values];
          const created: Row[] = [];
          for (const value of batch) {
            const found = value.id && tables[table].find(row => row.id === value.id);
            if (found) {
              if (action === "insert") return { data: null, error: { code: "23505", message: "duplicate" } };
              created.push(found);
            } else { tables[table].push(structuredClone(value)); created.push(value); }
          }
          return { data: one ? created[0] || null : created, error: null };
        }
        const rows = tables[table].filter(row => filters.every(fn => fn(row)));
        if (action === "update") rows.forEach(row => Object.assign(row, structuredClone(values)));
        return { data: one ? structuredClone(rows[0] || null) : structuredClone(rows), error: null };
      },
      then(resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) { return query.run().then(resolve, reject); },
    };
    return query;
  } } as unknown as ProductionDb;
  return { db, tables, calls, fail };
}

const company = { id: "company-a", name: "Example Company", slug: "example", spokesperson_name: "Alex", brand_color: "#A27BF9", post_pack: "b2b", industry: "software", description: "A software company" };
const seed = () => ({
  companies: [company],
  company_blueprints: [{ company_id: company.id, is_active: true, updated_at: "2026-10-01", blueprint_content: "Company positioning and approved facts.", derived_source_context: "Approved source: the company serves small teams.", derived_brand_context: "Purple and white." }],
  company_voice_profiles: [{ company_id: company.id, is_active: true, voice_description: "Direct and warm." }],
  strategy_audiences: [{ company_id: company.id, persona_name: "Operations lead", job_title: "Director", seniority: "senior", primary_problem: "Slow handoffs", pain_points: [] }],
  strategy_positioning: [{ company_id: company.id, positioning_statement: "Useful tools for small teams." }],
  company_signoffs: [{ company_id: company.id, is_active: true, signoff_text: "Speak soon", first_comment_template: null, applies_to_post_types: ["insight"], sort_order: 0 }],
  company_cta_urls: [{ company_id: company.id, is_active: true, url: "https://example.test", link_text: "Learn more", cta_tier: "primary", sort_order: 0 }],
  post_types: [{ slug: "insight", template_instructions: "Use an evidence-led structure.", word_count_min: 20, word_count_max: 80 }],
});
const job = (patch: Partial<ApiProductionJob> = {}): ApiProductionJob => ({
  id: "job-a", company_id: company.id, week_id: null, status: "running",
  input_payload: { kind: "direct", direct: { post_type_slug: "insight", topic: "A supplied topic", post_date: "2026-10-19", pillar: "Operations", notes: "The handoff takes two days." } },
  output_payload: {}, worker_id: "worker-a", ...patch,
});
async function author(f: ReturnType<typeof makeDb>, inputJob: ApiProductionJob, assertOwnership = vi.fn(async () => {})) {
  f.tables.content_generation_jobs ||= [];
  let storedJob = f.tables.content_generation_jobs.find(row => row.id === inputJob.id);
  if (!storedJob) {
    storedJob = { id: inputJob.id, company_id: inputJob.company_id, provider: "api_engine", job_type: "content_generation", status: "running", worker_id: "worker-a", lease_expires_at: new Date(Date.now() + 60_000).toISOString(), output_payload: inputJob.output_payload || {} };
    f.tables.content_generation_jobs.push(storedJob);
  }
  const current = { ...inputJob, output_payload: storedJob.output_payload };
  return generatePlannedPiece({ db: f.db, job: current, workerId: "worker-a", assertOwnership });
}
const output = (postType: string): ContentGenerationOutput => ({
  title: `${postType} title`, markdownBody: "A draft grounded in the supplied notes.", firstComment: null,
  wordCount: 8, postType, imagePrompt: null,
  assets: postType === "meme" ? [{ assetType: "image_copy", textContent: JSON.stringify({ title: "Monday arrives again" }) }]
    : postType === "mini_infographic" ? [{ assetType: "image_copy", textContent: JSON.stringify({ title: "A better handoff", points: ["Name the owner", "Agree the next step"] }) }]
      : [],
  writer: { provider: "openai", model: "gpt-test" },
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.generate.mockImplementation(async (input: ContentGenerationInput) => output(input.postTypeSlug || "insight"));
  mocks.validated.mockImplementation(async (provider: { generate: (input: ContentGenerationInput) => Promise<ContentGenerationOutput> }, input: ContentGenerationInput) => ({
    output: await provider.generate(input), validation: { allPassed: true, criticalFailures: [], highFailures: [], allResults: [], fixInstructions: "" }, iterations: 1, fixHistory: [],
  }));
  mocks.gates.mockResolvedValue([]);
  mocks.render.mockResolvedValue("https://storage.example/graphic.png");
});

describe("API production authoring", () => {
  it("shows timed-out or skipped quality checks as needing review", async () => {
    const f = makeDb(seed());
    mocks.gates.mockResolvedValue([{ gate: "hook_type", passed: true, severity: "high", explanation: "Gate could not be evaluated, so it was not applied.", fixInstruction: "" }]);
    const result = await author(f, job());
    expect(result.warnings.join(" ")).toContain("could not complete");
    const quality = f.tables.content_assets.find(row => row.asset_metadata?.original_type === "api_generation_quality");
    expect(quality?.asset_metadata.gates[0].passed).toBe(false);
  });

  it("creates a company-scoped pending text draft with source, strategy and voice context", async () => {
    const f = makeDb(seed());
    const result = await author(f, job());
    expect(f.tables.content_pieces?.[0]).toMatchObject({ company_id: company.id, content_type: "social_post", post_type: "insight", approval_status: "pending", markdown_body: "A draft grounded in the supplied notes." });
    expect(mocks.generate).toHaveBeenCalledWith(expect.objectContaining({
      topicTitle: "A supplied topic", topicDescription: "The handoff takes two days.",
      blueprintContent: "Company positioning and approved facts.", sourceContext: "Approved source: the company serves small teams.",
      voiceDescription: "Direct and warm.", signoffText: "Speak soon", ctaUrl: "https://example.test",
      preGenerationContext: expect.stringContaining("POSITIONING FROM THE STRATEGY INTERVIEW"),
      additionalContext: expect.stringContaining("The handoff takes two days."),
    }));
    expect(mocks.gates).toHaveBeenCalledWith(expect.objectContaining({ companyId: company.id, postTypeSlug: "insight" }));
    expect(f.tables.content_assets).toEqual(expect.arrayContaining([
      expect.objectContaining({ asset_metadata: { original_type: "api_generation_provenance", provider: "openai", model: "gpt-test" } }),
      expect.objectContaining({ asset_metadata: { original_type: "api_generation_quality", validation: expect.any(Object), gates: [] } }),
    ]));
    expect(f.calls.filter(call => call.table === "companies").every(call => call.filters.includes(`id=${company.id}`))).toBe(true);
    expect(f.calls.filter(call => ["company_blueprints", "company_voice_profiles", "strategy_audiences", "strategy_positioning", "company_signoffs", "company_cta_urls"].includes(call.table)).every(call => call.filters.includes(`company_id=${company.id}`))).toBe(true);
    expect(result.warnings.join(" ")).toContain("openai (gpt-test)");
  });

  it("reuses stable output on retry without a second billed generation", async () => {
    const f = makeDb(seed());
    const first = await author(f, job());
    const second = await author(f, job());
    expect(second.pieceId).toBe(first.pieceId);
    expect(mocks.generate).toHaveBeenCalledTimes(1);
    expect(f.tables.content_pieces).toHaveLength(1);
  });

  it.each(["approved", "changes_requested", "pending"])("preserves an existing %s editorial piece", async status => {
    const id = productionId(company.id, "api-production-piece", "job-a");
    const f = makeDb({ ...seed(), content_pieces: [{ id, company_id: company.id, approval_status: status, title: "Human-reviewed title", markdown_body: "Human-reviewed copy", cover_image_url: null }] });
    const result = await author(f, job());
    expect(result.pieceId).toBe(id);
    expect(f.tables.content_pieces[0].markdown_body).toBe("Human-reviewed copy");
    expect(mocks.generate).not.toHaveBeenCalled();
  });

  it("does not restore checkpoint assets onto content edited after the checkpoint", async () => {
    const inputJob = job({ id: "human-edited-checkpoint" });
    const id = productionId(company.id, "api-production-piece", inputJob.id);
    const saved = output("insight");
    inputJob.output_payload = { generation_checkpoint: { job_id: inputJob.id, company_id: company.id, piece_id: id, slot_id: null, output: saved } };
    const f = makeDb({ ...seed(), content_pieces: [{ id, company_id: company.id, generation_job_id: inputJob.id, approval_status: "pending", title: "Edited by a person", markdown_body: "The human edit must stay intact." }] });
    const result = await author(f, inputJob);
    expect(result.warnings).toContain("Existing content was preserved without replacing editorial work.");
    expect(f.tables.content_pieces[0].markdown_body).toBe("The human edit must stay intact.");
    expect(f.tables.content_assets).toBeUndefined();
    expect(mocks.generate).not.toHaveBeenCalled();
  });

  it("fails clearly when a source is absent or points only to a local path", async () => {
    const absent = makeDb({ ...seed(), company_blueprints: [{ ...seed().company_blueprints[0], derived_source_context: null }] });
    await expect(author(absent, job({ input_payload: { kind: "direct", direct: { post_type_slug: "insight", topic: "A topic", post_date: "2026-10-19" } } }))).rejects.toThrow("no readable source context");
    const slot = { id: "slot-a", company_id: company.id, week_id: null, week_number: 43, year: 2026, week_start_date: "2026-10-19", slot_date: "2026-10-20", day_of_week: "tuesday", slot_type: "thesis", slot_role: null, post_type_slug: "insight", topic: "Anchored topic", pillar: "Operations", theme: null, six_source_tags: null, source_owner: "stratty_canon", source_alternates: null, source_anchor: "Chapter 4, section 2", anchor_pending: false, image_direction: null, photo_needed: false, elu: null, elu_e: null, elu_l: null, elu_u: null, cta_tier: null, status: "planned", notes: null, seeded_from: null, seeded_at: null, created_at: "2026-10-18", updated_at: "2026-10-18" } as CalendarSlot;
    await expect(generatePlannedPiece({ db: absent.db, job: job({ input_payload: { kind: "slot", slot_id: slot.id } }), slot, workerId: "worker-a", assertOwnership: vi.fn(async () => {}) })).rejects.toThrow("a reference alone is not enough");
    const local = makeDb(seed());
    await expect(author(local, job({ input_payload: { kind: "direct", direct: { post_type_slug: "insight", topic: "A topic", post_date: "2026-10-19", notes: "/Users/alex/source.pdf" } } }))).rejects.toThrow("local source file");
    expect(local.tables.content_pieces).toBeUndefined();
    expect(mocks.generate).not.toHaveBeenCalled();
  });

  it("does not save any piece when generation fails", async () => {
    const f = makeDb(seed()); mocks.generate.mockRejectedValue(new Error("provider unavailable"));
    await expect(author(f, job())).rejects.toThrow("provider unavailable");
    expect(f.tables.content_pieces).toEqual([]);
    expect(f.tables.content_assets).toBeUndefined();
  });

  it("resumes a meme render from its saved image copy without another generation", async () => {
    const f = makeDb(seed());
    const memeJob = job({ id: "meme-render-retry", input_payload: { kind: "direct", direct: { post_type_slug: "meme", topic: "A source-backed topic", post_date: "2026-10-19", notes: "Supplied source facts." } } });
    mocks.generate.mockResolvedValue(output("meme"));
    mocks.render.mockRejectedValueOnce(new Error("temporary image failure")).mockResolvedValueOnce("https://storage.example/recovered.png");
    await expect(author(f, memeJob)).rejects.toThrow("temporary image failure");
    const resumed = await author(f, memeJob);
    expect(mocks.generate).toHaveBeenCalledTimes(1);
    expect(resumed.imageUrl).toBe("https://storage.example/recovered.png");
    expect(f.tables.content_pieces).toHaveLength(1);
  });

  it("resumes an asset write failure from the job checkpoint and keeps writer provenance", async () => {
    const f = makeDb(seed());
    const memeJob = job({ id: "meme-assets-retry", input_payload: { kind: "direct", direct: { post_type_slug: "meme", topic: "A source-backed topic", post_date: "2026-10-19", notes: "Supplied source facts." } } });
    mocks.generate.mockResolvedValue(output("meme"));
    f.fail["content_assets:upsert"] = "temporary asset failure";
    await expect(author(f, memeJob)).rejects.toThrow("Retry to resume from the saved generation");
    expect(f.tables.content_generation_jobs[0].output_payload.generation_checkpoint.output.writer).toEqual({ provider: "openai", model: "gpt-test" });
    delete f.fail["content_assets:upsert"];
    const resumed = await author(f, memeJob);
    expect(mocks.generate).toHaveBeenCalledTimes(1);
    expect(resumed.imageUrl).toBe("https://storage.example/graphic.png");
    expect(f.tables.content_assets).toEqual(expect.arrayContaining([
      expect.objectContaining({ asset_type: "custom", asset_metadata: { original_type: "image_copy" } }),
      expect.objectContaining({ asset_type: "custom", asset_metadata: { original_type: "api_generation_provenance", provider: "openai", model: "gpt-test" } }),
    ]));
  });

  it.each([
    ["meme", "meme", "meme"],
    ["mini_infographic", "social_post", "mini_infographic"],
    ["talking_head", "video_script", "talking_head"],
  ])("writes truthful %s output and matching assets", async (slug, contentType, imageType) => {
    const f = makeDb(seed());
    const input = { kind: "direct" as const, direct: { post_type_slug: slug, topic: "A source-backed topic", post_date: "2026-10-19", notes: "Supplied source facts." } };
    const result = await author(f, job({ id: `job-${slug}`, input_payload: input }));
    expect(f.tables.content_pieces?.[0]).toMatchObject({ content_type: contentType, post_type: slug, approval_status: "pending" });
    if (imageType === "meme" || imageType === "mini_infographic") {
      expect(f.tables.content_assets).toEqual(expect.arrayContaining([expect.objectContaining({ asset_type: "custom", asset_metadata: { original_type: "image_copy" } })]));
      expect(mocks.render).toHaveBeenCalledWith(expect.objectContaining({ postTypeSlug: imageType, pieceId: result.pieceId }));
      expect(result.imageUrl).toBe("https://storage.example/graphic.png");
    } else {
      expect(f.tables.content_assets).toEqual(expect.arrayContaining([expect.objectContaining({ asset_type: "script_text", text_content: "A draft grounded in the supplied notes." })]));
      expect(result.warnings.join(" ")).toContain("A rendered video has not been created");
      expect(mocks.render).not.toHaveBeenCalled();
    }
  });

  it("refuses a company from another tenant before calling its writer", async () => {
    const f = makeDb({ ...seed(), companies: [{ ...company, id: "company-b" }] });
    await expect(author(f, job({ company_id: "company-a" }))).rejects.toThrow("Company not found");
    expect(mocks.generate).not.toHaveBeenCalled();
  });
});
