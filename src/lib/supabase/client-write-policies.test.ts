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

/**
 * Migration 20261115100000 drops the four week_ecosystems policies and
 * narrows "Admin creates notifications" to admins (15 Nov 2026). That is only
 * safe while nothing with a user's own session inserts into notifications or
 * touches week_ecosystems at all.
 *
 * Here a file counts as holding a session client if usesSessionClient says so
 * OR it calls createServerClient( from @supabase/ssr: per the warning in
 * src/lib/supabase/admin.ts, that client sends the user's token whenever a
 * session cookie is present, even when built with the service key.
 */
const SCOPE_MIGRATION = path.join(
  ROOT,
  "supabase/migrations/20261115100000_scope_ecosystem_and_notification_policies.sql"
);

/**
 * Files allowed to insert into notifications on a session client, and why.
 *
 * src/app/api/notifications/route.ts builds its client with createServerClient
 * and the service key, so with a session cookie the insert runs on the
 * caller's own token, as role authenticated, under row security. It is safe
 * under the recreated policy: an admin caller passes, because
 * get_user_role() is SECURITY DEFINER and returns admin; a client caller
 * never reaches the insert, because the users policy "User reads self" lets
 * it see no admin recipients, so the recipient list is empty.
 */
const NOTIFICATION_INSERT_ALLOWLIST = ["src/app/api/notifications/route.ts"];

const holdsSessionClient = (src: string) => usesSessionClient(src) || src.includes("createServerClient(");

describe("week_ecosystems and notifications insert policies", () => {
  const sql = readFileSync(SCOPE_MIGRATION, "utf8");

  it("drops all four week_ecosystems policies, safe to run twice", () => {
    for (const verb of ["select", "insert", "update", "delete"]) {
      expect(sql).toContain(
        `DROP POLICY IF EXISTS "Authenticated users can ${verb} week_ecosystems" ON public.week_ecosystems;`
      );
    }
    expect(sql).not.toMatch(/CREATE POLICY[^;]*week_ecosystems/i);
  });

  it("drops then recreates the notifications insert policy, without OR true", () => {
    const drop = sql.indexOf('DROP POLICY IF EXISTS "Admin creates notifications" ON public.notifications;');
    const create = sql.indexOf('CREATE POLICY "Admin creates notifications" ON public.notifications');
    expect(drop).toBeGreaterThanOrEqual(0);
    expect(create).toBeGreaterThan(drop);
    const statement = sql.slice(create, sql.indexOf(";", create));
    expect(statement).toMatch(/FOR INSERT TO authenticated/);
    expect(statement).toMatch(/WITH CHECK \(public\.get_user_role\(\) = 'admin'\)/);
    expect(statement).not.toMatch(/or\s+true/i);
    const statements = sql.replace(/^--.*$/gm, "");
    expect(statements).not.toMatch(/own notifications/);
  });

  it("no code with a user's session inserts into notifications or touches week_ecosystems", () => {
    const offenders: string[] = [];
    for (const file of sourceFiles(path.join(ROOT, "src"))) {
      const src = readFileSync(file, "utf8");
      if (!holdsSessionClient(src)) continue;
      const rel = path.relative(ROOT, file);
      const lines = src.split("\n");
      lines.forEach((line, i) => {
        if (line.includes("week_ecosystems")) {
          offenders.push(`${rel}:${i + 1} week_ecosystems`);
        }
        if (!line.includes(`from("notifications")`)) return;
        if (NOTIFICATION_INSERT_ALLOWLIST.includes(rel)) return;
        const chain = lines.slice(i, i + 12).join("\n");
        if (/\.(insert|upsert)\(/.test(chain.split(/;\s*$/m)[0])) {
          offenders.push(`${rel}:${i + 1} notifications`);
        }
      });
    }
    expect(offenders).toEqual([]);
  });

  it("the allowlisted notifications insert still exists as described, so the allowlist cannot go stale", () => {
    for (const rel of NOTIFICATION_INSERT_ALLOWLIST) {
      const src = readFileSync(path.join(ROOT, rel), "utf8");
      expect(src).toContain("createServerClient(");
      expect(src).toContain(`from("notifications")`);
    }
  });
});
