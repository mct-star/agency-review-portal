/** Stateful local test double: evaluates conditional updates atomically when awaited. */
import type { ProductionDb } from "./types";

type Row = Record<string, any>; // Test rows intentionally represent multiple database tables.
type Filter = (row: Row) => boolean;
export function productionTestDb(seed: Record<string, Row[]> = {}) {
  const tables: Record<string, Row[]> = structuredClone(seed);
  const calls: Array<{ table: string; action: string; filters: string[]; values?: Row }> = [];
  const fail: Record<string, string | undefined> = {};
  class Query implements PromiseLike<any> {
    action = "select";
    filters: Filter[] = [];
    labels: string[] = [];
    values: Row = {};
    sorts: Array<{ key: string; asc: boolean }> = [];
    count = Infinity;
    executed?: Promise<any>;
    constructor(public table: string) {}
    select(_columns?: string) { return this; }
    update(values: Row) { this.action = "update"; this.values = values; return this; }
    insert(values: Row) { this.action = "insert"; this.values = values; return this; }
    eq(key: string, value: unknown) { this.labels.push(`${key}=eq:${String(value)}`); this.filters.push((row) => row[key] === value); return this; }
    is(key: string, value: unknown) { this.labels.push(`${key}=is:${String(value)}`); this.filters.push((row) => (row[key] ?? null) === value); return this; }
    in(key: string, values: unknown[]) { this.labels.push(`${key}=in:${values.join(",")}`); this.filters.push((row) => values.includes(row[key])); return this; }
    lt(key: string, value: string) { this.labels.push(`${key}=lt:${value}`); this.filters.push((row) => row[key] != null && row[key] < value); return this; }
    gt(key: string, value: string) { this.labels.push(`${key}=gt:${value}`); this.filters.push((row) => row[key] != null && row[key] > value); return this; }
    gte(key: string, value: string) { this.filters.push((row) => row[key] >= value); return this; }
    lte(key: string, value: string) { this.filters.push((row) => row[key] <= value); return this; }
    or(value: string) {
      const match = /lease_expires_at.lt.(.*),lease_expires_at.is.null/.exec(value);
      if (!match) throw new Error(`Unsupported OR: ${value}`);
      this.filters.push((row) => !row.lease_expires_at || row.lease_expires_at < match[1]);
      return this;
    }
    order(key: string, options: { ascending?: boolean } = {}) { this.sorts.push({ key, asc: options.ascending !== false }); return this; }
    limit(count: number) { this.count = count; return this; }
    single() { return this.execute().then((result) => ({ ...result, data: result.data?.[0] || null })); }
    maybeSingle() { return this.single(); }
    execute() {
      if (this.executed) return this.executed;
      calls.push({ table: this.table, action: this.action, filters: [...this.labels], values: structuredClone(this.values) });
      this.executed = Promise.resolve().then(() => {
        if (fail[`${this.table}:${this.action}`]) return { data: null, error: { message: fail[`${this.table}:${this.action}`] } };
        tables[this.table] ||= [];
        if (this.action === "insert") {
          const value = this.values;
          const duplicate = tables[this.table].some((row) => row.id === value.id || this.table === "content_generation_jobs" && value.week_id && row.week_id === value.week_id && row.job_type === value.job_type && ["queued", "running"].includes(row.status));
          if (duplicate) return { data: null, error: { code: "23505", message: "duplicate" } };
          const row = { created_at: new Date().toISOString(), ...structuredClone(value) };
          tables[this.table].push(row);
          return { data: [structuredClone(row)], error: null };
        }
        let rows = tables[this.table].filter((row) => this.filters.every((filter) => filter(row)));
        for (const { key, asc } of [...this.sorts].reverse()) rows.sort((a, b) => String(a[key]).localeCompare(String(b[key])) * (asc ? 1 : -1));
        rows = rows.slice(0, this.count);
        if (this.action === "update") for (const row of rows) Object.assign(row, structuredClone(this.values));
        return { data: structuredClone(rows), error: null };
      });
      return this.executed;
    }
    then<TResult1 = any, TResult2 = never>(onfulfilled?: ((value: any) => TResult1 | PromiseLike<TResult1>) | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null): PromiseLike<TResult1 | TResult2> {
      return this.execute().then(onfulfilled, onrejected);
    }
  }
  const db = { from: (table: string) => new Query(table) } as unknown as ProductionDb;
  return { db, tables, calls, fail };
}
