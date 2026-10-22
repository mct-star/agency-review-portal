import { describe, expect, it } from "vitest";
import { isUnreadableLocalSourceReference, loadProductionContext } from "./context";
import { productionTestDb } from "./fake-db.test-helper";

const company = { id: "company-a", name: "Example", slug: "example", spokesperson_name: null, brand_color: null, created_at: "2026-10-01" };

describe("hosted production context", () => {
  it("loads source, voice and company strategy only through company-scoped rows", async () => {
    const f = productionTestDb({
      companies: [company],
      company_blueprints: [
        { company_id: "company-a", is_active: true, updated_at: "2026-10-01", blueprint_content: "Company A evidence.", derived_source_context: "Company A source notes.", derived_brand_context: "Company A colours." },
        { company_id: "company-b", is_active: true, updated_at: "2026-10-02", blueprint_content: "Company B secret.", derived_source_context: "Company B source.", derived_brand_context: null },
      ],
      company_voice_profiles: [{ company_id: "company-a", is_active: true, created_at: "2026-10-01", voice_description: "Direct." }],
      strategy_audiences: [{ company_id: "company-a", persona_name: "Operations lead", job_title: null, seniority: null, primary_problem: "Handoffs", pain_points: [] }],
      strategy_positioning: [{ company_id: "company-a", positioning_statement: "Practical systems." }],
      company_signoffs: [], company_cta_urls: [], post_types: [{ slug: "insight", template_instructions: null, word_count_min: null, word_count_max: null }],
    });
    const loaded = await loadProductionContext(f.db, "company-a", "insight");
    expect(loaded.input.sourceContext).toBe("Company A source notes.");
    expect(loaded.input.brandContext).toBe("Company A colours.");
    expect(loaded.strategyContext).toContain("Operations lead");
    expect(loaded.strategyContext).not.toContain("Company B");
    for (const query of f.calls.filter(call => ["company_blueprints", "company_voice_profiles", "strategy_audiences", "strategy_positioning", "company_signoffs", "company_cta_urls"].includes(call.table))) {
      expect(query.filters).toContain("company_id=eq:company-a");
    }
  });

  it("rejects missing company setup and hosted access to local source paths", async () => {
    const f = productionTestDb({ companies: [company], company_blueprints: [] });
    await expect(loadProductionContext(f.db, "company-a", "insight")).rejects.toThrow("Add an active company blueprint");
    expect(isUnreadableLocalSourceReference("/Users/person/source.pdf")).toBe(true);
    expect(isUnreadableLocalSourceReference("~/Documents/source.docx")).toBe(true);
    expect(isUnreadableLocalSourceReference("A specific section from the published guide")).toBe(false);
  });
});
