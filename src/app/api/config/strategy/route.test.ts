import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { MockInstance } from "vitest";

/**
 * A markdown strategy import stores the document as the company's blueprint.
 * It used to insert the row as active without deactivating the current one,
 * which left the company with two active blueprints, and it ignored the insert
 * error, so a second import (same version, so the unique (company_id, version)
 * index rejects it) failed silently and still answered "Blueprint stored".
 *
 * Each import now gets its own version, so a re-import succeeds and the earlier
 * import stays as history.
 *
 * The fake client keeps company_blueprints in memory and enforces that unique
 * index the way Postgres does, so these tests check the rows a company is left
 * with, not the calls the route made.
 */

type BlueprintRow = {
  id: string;
  company_id: string;
  version: string;
  blueprint_content: string;
  is_active: boolean;
};

const h = vi.hoisted(() => ({
  blueprints: [] as BlueprintRow[],
  writes: [] as { table: string; row: unknown }[],
  insertError: null as { code: string; message: string } | null,
  nextId: 1,
}));

function blueprintsTable() {
  return {
    insert: (row: Omit<BlueprintRow, "id" | "is_active"> & { is_active?: boolean }) => {
      const run = () => {
        if (h.insertError) return { data: null, error: h.insertError };
        if (h.blueprints.some((b) => b.company_id === row.company_id && b.version === row.version)) {
          return {
            data: null,
            error: {
              code: "23505",
              message: 'duplicate key value violates unique constraint "company_blueprints_company_id_version_key"',
            },
          };
        }
        const created: BlueprintRow = { id: `bp-new-${h.nextId++}`, is_active: true, ...row };
        h.blueprints.push(created);
        return { data: created, error: null };
      };
      return {
        select: () => ({ single: async () => run() }),
        then: (resolve: (v: unknown) => void) => resolve({ data: null, error: run().error }),
      };
    },
    update: (patch: Partial<BlueprintRow>) => {
      const filters: ((b: BlueprintRow) => boolean)[] = [];
      const builder = {
        eq: (column: keyof BlueprintRow, value: unknown) => {
          filters.push((b) => b[column] === value);
          return builder;
        },
        then: (resolve: (v: unknown) => void) => {
          for (const b of h.blueprints) if (filters.every((f) => f(b))) Object.assign(b, patch);
          resolve({ data: null, error: null });
        },
      };
      return builder;
    },
  };
}

function recordingTable(table: string) {
  const chain: Record<string, unknown> = {};
  for (const m of ["select", "eq", "order", "limit"]) chain[m] = () => chain;
  for (const m of ["insert", "update", "upsert"]) {
    chain[m] = (row: unknown) => {
      h.writes.push({ table, row });
      return chain;
    };
  }
  chain.single = async () => ({ data: null, error: null });
  chain.then = (resolve: (v: unknown) => void) => resolve({ data: null, error: null });
  return chain;
}

vi.mock("@/lib/supabase/admin", () => ({
  requireAdmin: vi.fn(async () => ({ id: "admin-1" })),
  requireCompanyUser: vi.fn(async () => ({ id: "user-1" })),
  createAdminSupabaseClient: async () => ({
    from: (table: string) => (table === "company_blueprints" ? blueprintsTable() : recordingTable(table)),
  }),
}));

vi.mock("@/lib/providers", () => ({
  resolveProvider: vi.fn(async () => null),
}));

import { POST } from "./route";

const req = (body: unknown) =>
  new Request("http://localhost/api/config/strategy", { method: "POST", body: JSON.stringify(body) });

const activeFor = (companyId: string) => h.blueprints.filter((b) => b.company_id === companyId && b.is_active);

let errorSpy: MockInstance;

beforeEach(() => {
  h.blueprints.length = 0;
  h.writes.length = 0;
  h.insertError = null;
  h.nextId = 1;
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  errorSpy.mockRestore();
});

describe("POST /api/config/strategy: a markdown import becomes the one active blueprint", () => {
  it("deactivates the company's current blueprint, so the import is its only active one", async () => {
    h.blueprints.push(
      { id: "bp-current", company_id: "c1", version: "1.0", blueprint_content: "The current blueprint.", is_active: true },
      { id: "bp-other-company", company_id: "c2", version: "1.0", blueprint_content: "Another company's blueprint.", is_active: true },
    );

    const res = await POST(req({ companyId: "c1", format: "markdown", content: "# The imported strategy" }));
    const json = await res.json();
    expect(res.status, JSON.stringify(json)).toBe(200);

    const active = activeFor("c1");
    expect(active).toHaveLength(1);
    expect(active[0].blueprint_content).toBe("# The imported strategy");
    expect(activeFor("c2").map((b) => b.id)).toEqual(["bp-other-company"]);
  });

  it("returns an error, keeps the current blueprint active and marks no setup step done when the blueprint cannot be stored", async () => {
    h.blueprints.push({ id: "bp-current", company_id: "c1", version: "1.0", blueprint_content: "The current blueprint.", is_active: true });
    h.insertError = { code: "08006", message: "connection failure" };

    const res = await POST(req({ companyId: "c1", format: "markdown", content: "# The imported strategy" }));
    const json = await res.json();
    expect(res.status, JSON.stringify(json)).toBe(500);
    expect(json.error).toMatch(/blueprint/i);
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("c1"), expect.stringMatching(/connection failure/));

    const active = activeFor("c1");
    expect(active.map((b) => b.id)).toEqual(["bp-current"]);
    expect(active[0].blueprint_content).toBe("The current blueprint.");
    expect(h.writes.filter((w) => w.table === "setup_progress")).toHaveLength(0);
  });

  it("gives each import its own version, so a re-import succeeds and the earlier import stays as history", async () => {
    h.blueprints.push({
      id: "bp-earlier-import",
      company_id: "c1",
      version: "imported",
      blueprint_content: "The earlier import.",
      is_active: true,
    });

    const res = await POST(req({ companyId: "c1", format: "markdown", content: "# A second import" }));
    const json = await res.json();
    expect(res.status, JSON.stringify(json)).toBe(200);

    const active = activeFor("c1");
    expect(active).toHaveLength(1);
    expect(active[0].blueprint_content).toBe("# A second import");
    expect(active[0].version).toMatch(/^imported \d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} UTC$/);
    expect(h.blueprints.find((b) => b.id === "bp-earlier-import")).toMatchObject({
      blueprint_content: "The earlier import.",
      is_active: false,
    });
  });
});
