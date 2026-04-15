import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import fs from "fs";
import path from "path";

/**
 * Accessibility sweep — runs axe-core against every priority page.
 * Reports critical + serious WCAG 2.0 A/AA and 2.1 AA violations only.
 * Raw JSON output saved to sweep-results/<run>/axe-<page>.json.
 */

const PRIORITY_PAGES = [
  "/home",
  "/generate/quick",
  "/review",
  "/compliance",
  "/calendar",
  "/publish",
  "/analytics",
  "/settings",
  "/strategy",
];

// Create timestamped output directory
const RUN_ID = process.env.SWEEP_RUN_ID || new Date().toISOString().slice(0, 13).replace(/[-:T]/g, "");
const OUT_DIR = path.join("sweep-results", RUN_ID);

test.beforeAll(() => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
});

for (const pagePath of PRIORITY_PAGES) {
  test(`a11y: ${pagePath} has no critical/serious violations`, async ({ page }) => {
    await page.goto(pagePath, { waitUntil: "networkidle" });

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();

    const critical = results.violations.filter(
      (v) => v.impact === "critical" || v.impact === "serious"
    );

    // Save raw output for consolidate step
    const safeName = pagePath.replace(/\//g, "_") || "_root";
    fs.writeFileSync(
      path.join(OUT_DIR, `axe${safeName}.json`),
      JSON.stringify({ page: pagePath, violations: results.violations, critical }, null, 2)
    );

    // Report detailed failure info
    const summary = critical.map((v) => ({
      rule: v.id,
      impact: v.impact,
      help: v.help,
      nodes: v.nodes.length,
      firstTarget: v.nodes[0]?.target,
    }));

    expect
      .soft(critical, `${pagePath}: ${critical.length} critical/serious violations\n${JSON.stringify(summary, null, 2)}`)
      .toEqual([]);
  });
}
