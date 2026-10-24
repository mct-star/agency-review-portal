import { describe, expect, it } from "vitest";
import { getProductionWeekCount, getSettingsPeople } from "./company-settings-data";

function queryClient(rows: Record<string, unknown[]>, counts: Record<string, number>) {
  const calls: Array<{ table: string; method: string; args: unknown[] }> = [];
  const client = {
    from(table: string) {
      const query: Record<string, unknown> = {};
      for (const method of ["select", "eq", "gt", "order"]) {
        query[method] = (...args: unknown[]) => {
          calls.push({ table, method, args });
          return query;
        };
      }
      query.then = (resolve: (value: unknown) => unknown) => resolve({
        data: rows[table] ?? [],
        count: counts[table] ?? 0,
      });
      return query;
    },
  };
  return { client: client as never, calls };
}

describe("company settings data", () => {
  it("reads active spokespersons scoped to the company and counts them", async () => {
    const { client, calls } = queryClient({ company_spokespersons: [{ id: "andrew" }] }, { company_spokespersons: 1 });

    await expect(getSettingsPeople(client, "company-a")).resolves.toEqual({
      people: [{ id: "andrew" }],
      count: 1,
    });
    expect(calls.filter((call) => call.method === "eq")).toContainEqual({
      table: "company_spokespersons",
      method: "eq",
      args: ["company_id", "company-a"],
    });
    expect(calls.filter((call) => call.method === "eq")).toContainEqual({
      table: "company_spokespersons",
      method: "eq",
      args: ["is_active", true],
    });
  });

  it("excludes the standalone week zero from the production week count", async () => {
    const { client, calls } = queryClient({}, { weeks: 1 });

    await expect(getProductionWeekCount(client, "company-a")).resolves.toBe(1);
    expect(calls).toContainEqual({ table: "weeks", method: "gt", args: ["week_number", 0] });
    expect(calls).toContainEqual({ table: "weeks", method: "eq", args: ["company_id", "company-a"] });
  });
});
