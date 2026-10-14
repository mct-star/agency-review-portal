import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
// Importing the module keeps this test honest: if it moves, this fails to compile.
import { currentClaudeModel } from "@/lib/providers/content-adaptation/claude-util";

const SRC = path.join(__dirname, "..", "..");
const SELF = path.join(__dirname, "provider-truth.test.ts");

/** The only files allowed to call the Anthropic API directly. */
const MAY_CALL_ANTHROPIC = [
  "src/lib/providers/content-adaptation/claude-util.ts",
  "src/lib/providers/content-generation/generate-text.ts",
  "src/lib/providers/vision/tag-image.ts",
];
/** The only files allowed to name a retired model id (the RETIRED map and its test). */
const MAY_NAME_RETIRED = [
  "src/lib/providers/content-adaptation/claude-util.ts",
  "src/lib/providers/content-adaptation/claude-util.test.ts",
];
const RETIRED_IDS = [
  "claude-sonnet-4-20250514",
  "claude-opus-4-20250514",
  "claude-3-5-haiku-20241022",
  "claude-haiku-4-20250514",
];

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.(ts|tsx)$/.test(name)) out.push(full);
  }
  return out;
}

const files = [...walk(path.join(SRC, "app", "api")), ...walk(path.join(SRC, "lib"))]
  .filter((f) => f !== SELF)
  .map((f) => ({ rel: path.relative(path.join(SRC, ".."), f), text: readFileSync(f, "utf8") }));

describe("provider truth", () => {
  it("scans real files and the module still exports the current model", () => {
    expect(files.length).toBeGreaterThan(50);
    expect(typeof currentClaudeModel).toBe("function");
  });

  it("only the provider module, generate-text and tag-image call api.anthropic.com", () => {
    const offenders = files
      .filter((f) => f.text.includes("api.anthropic.com") && !MAY_CALL_ANTHROPIC.includes(f.rel))
      .map((f) => f.rel);
    expect(offenders).toEqual([]);
  });

  it("no file names a retired Claude model id outside claude-util and its test", () => {
    const offenders = files
      .filter((f) => !MAY_NAME_RETIRED.includes(f.rel) && RETIRED_IDS.some((id) => f.text.includes(id)))
      .map((f) => f.rel);
    expect(offenders).toEqual([]);
  });
});
