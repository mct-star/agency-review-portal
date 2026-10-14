import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { TAG_VOCABULARY } from "@/lib/media/vocabulary";

/**
 * The live-check runner (scripts/live-check-lakeside.mjs) talks to the real
 * project, so it cannot run in CI. Its pure parts and its refusal to leak a
 * secret are tested here.
 */
const SCRIPT = path.resolve(__dirname, "../../scripts/live-check-lakeside.mjs");
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const load = async (): Promise<any> => import(/* @vite-ignore */ SCRIPT);

describe("redact", () => {
  it("removes every configured secret value, whole or embedded, and names which", async () => {
    const { redact } = await load();
    const env = { SUPABASE_SERVICE_ROLE_KEY: "service-role-value-123456", CRON_SECRET: "cron-secret-value-9999" } as Record<string, string>;
    const out = redact("a service-role-value-123456 b Bearer cron-secret-value-9999 c", env);
    expect(out).not.toContain("service-role-value-123456");
    expect(out).not.toContain("cron-secret-value-9999");
    expect(out).toContain("[redacted:SUPABASE_SERVICE_ROLE_KEY]");
    expect(out).toContain("[redacted:CRON_SECRET]");
  });
  it("removes JWTs and key= query values even when the value is not in the env", async () => {
    const { redact } = await load();
    const jwt = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4ifQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV";
    expect(redact(`token ${jwt} end`, {})).not.toContain("eyJhbGci");
    expect(redact("https://x/api?key=abcdef123456&b=1", {})).toBe("https://x/api?key=[redacted]&b=1");
  });
});

describe("vocabulary", () => {
  it("is read from the app's own source, identical to the constant", async () => {
    const { extractVocabulary } = await load();
    const src = readFileSync(path.resolve(__dirname, "media/vocabulary.ts"), "utf8");
    expect(extractVocabulary(src)).toEqual(JSON.parse(JSON.stringify(TAG_VOCABULARY)));
  });
  it("flags values outside the vocabulary and shapes that are not allowed", async () => {
    const { extractVocabulary, checkTaggerJson } = await load();
    const vocab = extractVocabulary(readFileSync(path.resolve(__dirname, "media/vocabulary.ts"), "utf8"));
    const good = { weather: ["sunny"], place: ["deck"], subject: ["food"], time_of_day: ["lunch"], people_present: false, text_space: true, scene: "A deck." };
    expect(checkTaggerJson(JSON.stringify(good), vocab).ok).toBe(true);
    const bad = checkTaggerJson(JSON.stringify({ ...good, weather: ["sunny", "tornado"], place: ["pool"], people_present: "no" }), vocab);
    expect(bad.ok).toBe(false);
    expect(bad.offenders.join(" ")).toMatch(/tornado/);
    expect(bad.offenders.join(" ")).toMatch(/pool/);
    expect(bad.offenders.join(" ")).toMatch(/people_present/);
    expect(checkTaggerJson("not json", vocab).ok).toBe(false);
  });
});

describe("assessCaption", () => {
  const dash = String.fromCharCode(0x2014);
  const good = "Sea bass is on today.\n\nCrushed potatoes, 22 pounds, while it lasts.\n\n#lunch #seabass #lakeside";
  it("passes a clean British caption with a hashtag block", async () => {
    const { assessCaption } = await load();
    expect(assessCaption(good, { brief: "sea bass 22 pounds" }).pass).toBe(true);
  });
  it("fails each house-rule breach", async () => {
    const { assessCaption } = await load();
    expect(assessCaption(good.replace("today", `today ${dash} come in`)).problems.join()).toMatch(/long dash/);
    expect(assessCaption(good + " \u{1F37D}").problems.join()).toMatch(/emoji|hashtag/);
    expect(assessCaption(good.replace("Sea bass", "Our favorite flavor")).problems.join()).toMatch(/American/);
    expect(assessCaption(good.replace("Sea bass", "Excited to announce sea bass")).problems.join()).toMatch(/LinkedIn or corporate/);
    expect(assessCaption("Sea bass today, no tags.").problems.join()).toMatch(/hashtag/);
  });
  it("allows emoji when the company toggle is on, and reports figures that were not in the brief", async () => {
    const { assessCaption } = await load();
    expect(assessCaption(good.replace("today", "today \u{1F41F}"), { allowEmoji: true }).problems.join()).not.toMatch(/emoji/);
    expect(assessCaption(good, { brief: "sea bass" }).unsupportedFigures).toEqual(["22"]);
  });
});

describe("big clip padding", () => {
  it("builds an MP4 free box header of exactly the requested size", async () => {
    const { freeBoxHeader } = await load();
    const h = freeBoxHeader(1_000_000);
    expect(h.readUInt32BE(0)).toBe(1_000_000);
    expect(h.subarray(4).toString("ascii")).toBe("free");
    expect(() => freeBoxHeader(4)).toThrow();
  });
});

describe("budget", () => {
  it("refuses a step that would pass the ceiling and does not count it", async () => {
    const { Budget } = await load();
    const b = new Budget(0.1);
    expect(b.add("write", 5, 0.012)).toBe(true);
    expect(b.add("write", 5, 0.012)).toBe(false);
    expect(b.total).toBeCloseTo(0.06);
  });
});

describe("file choice", () => {
  it("avoids people, personal and finance paths, spreads over folders, and sizes sensibly", async () => {
    const { choosePhotos, chooseClip } = await load();
    const f = (file: string, size = 500_000) => ({ file, size });
    const files = [
      f("/d/Contura/office exterior/IMG_1.jpg"), f("/d/Contura/office exterior/IMG_2.jpg"), f("/d/menus/menu_dish.png"), f("/d/lake/lake.jpg"),
      f("/d/garden/garden.webp"), f("/d/misc/photo.jpg"), f("/d/team/staff_group.jpg"), f("/d/Finance/invoice_scan.jpg"), f("/d/x/portrait_michael.jpg"),
      f("/d/tiny/small.jpg", 1000), f("/d/huge/huge.jpg", 50_000_000), f("/d/doc.pdf"),
    ];
    const picked = choosePhotos(files, 5).map((p: { file: string }) => p.file);
    expect(picked).toHaveLength(5);
    for (const bad of ["staff_group", "invoice_scan", "portrait_michael", "small.jpg", "huge.jpg", "doc.pdf"]) expect(picked.join()).not.toContain(bad);
    expect(new Set(picked.map((p: string) => p.split("/").slice(0, 3).join("/"))).size).toBeGreaterThanOrEqual(4);
    expect(chooseClip([f("/d/a.mp4", 90_000_000), f("/d/b.mov", 5_000_000), f("/d/c.mp4", 500)])?.file).toBe("/d/b.mov");
  });
});

describe("the script as a program (no network, no real env)", () => {
  const run = (args: string[], env: Record<string, string>) =>
    spawnSync(process.execPath, [SCRIPT, ...args], { encoding: "utf8", env: { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "", ...env } as unknown as NodeJS.ProcessEnv, timeout: 60_000 });

  it("preflight with no env file names the missing variables and prints no values", () => {
    const r = run(["preflight"], { LIVE_CHECK_ENV_FILE: path.join(tmpdir(), "does-not-exist.env") });
    expect(r.status).toBe(1);
    expect(r.stdout).toMatch(/Missing variables \(names only\)/);
    for (const n of ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "CRON_SECRET"]) expect(r.stdout).toContain(n);
  });

  it("run stops at once, naming only what is missing, when a variable is absent, and never prints the ones that are set", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "lc-"));
    const envFile = path.join(dir, ".env");
    const secret = "super-secret-service-value-0123456789";
    writeFileSync(envFile, `SUPABASE_SERVICE_ROLE_KEY=${secret}\nNEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co\n`);
    const r = run(["run"], { LIVE_CHECK_ENV_FILE: envFile });
    expect(r.status).toBe(2);
    expect(r.stdout).toContain("CRON_SECRET");
    expect(r.stdout).toContain("NEXT_PUBLIC_SUPABASE_ANON_KEY");
    expect(r.stdout + r.stderr).not.toContain(secret);
    expect(r.stdout + r.stderr).not.toContain("example.supabase.co");
  });

  it("prints usage for an unknown command", () => {
    expect(run(["bogus"], {}).status).toBe(2);
  });
});
