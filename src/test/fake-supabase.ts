/**
 * A minimal chainable stand-in for the Supabase client, for route and
 * helper tests that must not touch a network.
 *
 * Every builder method (select, eq, in, order, ...) returns the same
 * proxy; awaiting it, or calling a terminal such as single() or
 * maybeSingle(), resolves to whatever was configured for that table.
 * Every call is recorded so a test can assert what was written.
 */

export interface TableResult {
  data?: unknown;
  error?: { message: string; code?: string } | null;
  count?: number | null;
}

export interface RecordedCall {
  table: string;
  method: string;
  args: unknown[];
}

export type TableConfig = Record<
  string,
  TableResult | ((calls: RecordedCall[]) => TableResult)
>;

export interface FakeOptions {
  /** Result per storage method name, for example createSignedUploadUrl. */
  storage?: Record<string, { data?: unknown; error?: { message: string } | null }>;
}

export function fakeSupabase(config: TableConfig = {}, options: FakeOptions = {}) {
  const calls: RecordedCall[] = [];

  function builder(table: string) {
    const own: RecordedCall[] = [];
    const resolve = (): TableResult => {
      const entry = config[table];
      const result = typeof entry === "function" ? entry(own) : entry ?? {};
      return { data: null, error: null, count: null, ...result };
    };
    const proxy: unknown = new Proxy(
      {},
      {
        get(_t, prop: string) {
          if (prop === "then") {
            return (ok: (v: TableResult) => unknown, bad?: (e: unknown) => unknown) =>
              Promise.resolve(resolve()).then(ok, bad);
          }
          return (...args: unknown[]) => {
            const call = { table, method: prop, args };
            calls.push(call);
            own.push(call);
            if (prop === "single" || prop === "maybeSingle") {
              return Promise.resolve(resolve());
            }
            return proxy;
          };
        },
      }
    );
    return proxy;
  }

  const storageCalls: RecordedCall[] = [];
  const storage = {
    from(bucket: string) {
      return new Proxy(
        {},
        {
          get(_t, prop: string) {
            return (...args: unknown[]) => {
              storageCalls.push({ table: bucket, method: prop, args });
              const result = options.storage?.[prop] ?? {};
              return Promise.resolve({ data: null, error: null, ...result });
            };
          },
        }
      );
    },
  };

  return {
    client: {
      from: (table: string) => builder(table),
      rpc: (fn: string, args?: unknown) => {
        calls.push({ table: `rpc:${fn}`, method: "rpc", args: [args] });
        return builder(`rpc:${fn}`);
      },
      storage,
    },
    calls,
    storageCalls,
  };
}
