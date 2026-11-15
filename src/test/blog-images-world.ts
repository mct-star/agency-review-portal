import { fakeSupabase, type RecordedCall } from "@/test/fake-supabase";

/**
 * A small in-memory world for the blog image routes: pieces, their
 * content_images rows, the companies' gate settings and a storage bucket.
 * Built on fakeSupabase, so every call is recorded; reads answer from the
 * rows, filtered by the eq() calls made, and writes change them.
 */

export interface WorldPiece {
  id: string;
  company_id: string;
  content_type: string;
  title: string;
  markdown_body: string;
}

export interface WorldImage {
  id: string;
  content_piece_id: string;
  archetype: string | null;
  public_url: string | null;
  filename?: string | null;
  storage_path?: string | null;
  dimensions?: string | null;
  image_record?: unknown;
  sort_order?: number | null;
  created_at?: string | null;
}

export interface WorldInit {
  pieces?: WorldPiece[];
  images?: WorldImage[];
  /** provider_settings of the blog_gate row, by company id. */
  gateSettings?: Record<string, unknown>;
  /** Make every content_images write fail with this message. */
  writeError?: string;
}

const eqs = (calls: RecordedCall[]) =>
  Object.fromEntries(calls.filter(c => c.method === "eq").map(c => [c.args[0] as string, c.args[1]]));

const matches = (row: Record<string, unknown>, filters: Record<string, unknown>) =>
  Object.entries(filters).every(([k, v]) => row[k] === v);

export function blogImagesWorld(init: WorldInit = {}) {
  const state = {
    pieces: [...(init.pieces || [])],
    images: (init.images || []).map(i => ({ ...i })),
    writeError: init.writeError,
  };
  let nextId = 1;

  const fake = fakeSupabase({
    content_pieces: (calls) => {
      const f = eqs(calls);
      return { data: state.pieces.find(p => matches(p as unknown as Record<string, unknown>, f)) ?? null };
    },
    company_api_configs: (calls) => {
      const f = eqs(calls);
      const company = f.company_id as string;
      const ok = f.service_category === "blog_publishing" && f.provider === "blog_gate" && f.is_active === true;
      return { data: ok && init.gateSettings && company in init.gateSettings ? { provider_settings: init.gateSettings[company] } : null };
    },
    content_images: (calls) => {
      const f = eqs(calls);
      const write = calls.find(c => ["insert", "update", "delete"].includes(c.method));
      if (write && state.writeError) return { data: null, error: { message: state.writeError } };
      if (write?.method === "insert") {
        const row = { id: `img-new-${nextId++}`, ...(write.args[0] as Record<string, unknown>) } as WorldImage;
        state.images.push(row);
        return { data: row };
      }
      const inIds = calls.find(c => c.method === "in")?.args[1] as string[] | undefined;
      const hit = (r: WorldImage) => matches(r as unknown as Record<string, unknown>, f) && (!inIds || inIds.includes(r.id));
      if (write?.method === "update") {
        for (const r of state.images.filter(hit)) Object.assign(r, write.args[0]);
        return { data: null };
      }
      if (write?.method === "delete") {
        state.images = state.images.filter(r => !hit(r));
        return { data: null };
      }
      const rows = state.images.filter(hit);
      if (calls.some(c => c.method === "maybeSingle")) return { data: rows[0] ?? null };
      if (calls.some(c => c.method === "limit")) {
        const top = [...rows].sort((a, b) => (b.sort_order ?? -1) - (a.sort_order ?? -1));
        return { data: top.slice(0, 1) };
      }
      return { data: [...rows].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)) };
    },
  });

  const storageCalls: RecordedCall[] = [];
  const objects = new Set<string>();
  const bucket = (name: string) => ({
    upload: async (path: string, ...rest: unknown[]) => {
      storageCalls.push({ table: name, method: "upload", args: [path, ...rest] });
      objects.add(path);
      return { data: { path }, error: null };
    },
    remove: async (paths: string[]) => {
      storageCalls.push({ table: name, method: "remove", args: [paths] });
      paths.forEach(p => objects.delete(p));
      return { data: null, error: null };
    },
    getPublicUrl: (path: string) => ({ data: { publicUrl: `https://storage.example.com/${name}/${path}` } }),
  });
  (fake.client as unknown as { storage: unknown }).storage = { from: bucket };

  return { client: fake.client, calls: fake.calls, storageCalls, objects, state };
}

/** Every call that touched content_images, company_api_configs or storage: the reads and writes beyond the piece itself. */
export function callsBeyondPiece(world: ReturnType<typeof blogImagesWorld>) {
  return [...world.calls.filter(c => c.table !== "content_pieces"), ...world.storageCalls];
}
