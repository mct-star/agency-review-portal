import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import path from "path";

/**
 * Migration 20261115090000 drops the client UPDATE policies on
 * content_pieces and platform_variants (15 Nov 2026). That is only safe
 * while nothing running with a user's own session writes those tables:
 * every write goes through an API route on the service-role client.
 *
 * These are static checks of the repository. They do not run the SQL
 * against a database.
 */
const ROOT = path.resolve(__dirname, "../../..");
const MIGRATION = path.join(ROOT, "supabase/migrations/20261115090000_drop_client_update_policies.sql");
const GUARDED = ["content_pieces", "platform_variants"];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name) ? [full] : [];
  });
}

/** Files that hold a Supabase client carrying the user's session. */
function usesSessionClient(src: string): boolean {
  return src.includes('from "@/lib/supabase/client"') || src.includes("createServerSupabaseClient(");
}

describe("client update policies on content_pieces and platform_variants", () => {
  it("the migration drops both policies and is safe to run twice", () => {
    const sql = readFileSync(MIGRATION, "utf8");
    expect(sql).toMatch(/DROP POLICY IF EXISTS "Client updates approval" ON public\.content_pieces;/);
    expect(sql).toMatch(/DROP POLICY IF EXISTS "Client updates variant approval" ON public\.platform_variants;/);
    expect(sql).not.toMatch(/CREATE POLICY/i);
  });

  it("no code with a user's session writes either table", () => {
    const offenders: string[] = [];
    for (const file of sourceFiles(path.join(ROOT, "src"))) {
      const src = readFileSync(file, "utf8");
      if (!usesSessionClient(src)) continue;
      const lines = src.split("\n");
      lines.forEach((line, i) => {
        const table = GUARDED.find((t) => line.includes(`from("${t}")`));
        if (!table) return;
        const chain = lines.slice(i, i + 12).join("\n");
        if (/\.(update|upsert|insert|delete)\(/.test(chain.split(/;\s*$/m)[0])) {
          offenders.push(`${path.relative(ROOT, file)}:${i + 1} ${table}`);
        }
      });
    }
    expect(offenders).toEqual([]);
  });
});
