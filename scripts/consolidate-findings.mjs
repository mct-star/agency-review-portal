#!/usr/bin/env node
/**
 * Consolidates findings from all sweep workstreams into a single ranked punch-list.
 *
 * Reads from sweep-results/<run>/:
 *   - test-results/results.json         (Playwright smoke + a11y results)
 *   - axe_*.json                         (per-page axe output)
 *   - psi.json                           (PageSpeed Insights results)
 *   - bundle-check.json                  (bundle size analysis)
 *   - api-smoke.log                      (API smoke test output)
 *   - ux-scores.json                     (optional; from UX scoring pass)
 *
 * Writes:
 *   - sweep-results/<run>/punch-list.md
 *   - sweep-results/<run>/summary.json
 */

import fs from "node:fs";
import path from "node:path";

const RUN_ID = process.env.SWEEP_RUN_ID || new Date().toISOString().slice(0, 13).replace(/[-:T]/g, "");
const RUN_DIR = path.join("sweep-results", RUN_ID);
const PLAYWRIGHT_RESULTS = path.join("test-results", "results.json");

if (!fs.existsSync(RUN_DIR)) {
  console.error(`No sweep results found at ${RUN_DIR}`);
  process.exit(1);
}

const findings = [];
let nextId = 1;

function addFinding({ severity, area, target, finding, fix, estMin = 30 }) {
  findings.push({ id: nextId++, severity, area, target, finding, fix, estMin });
}

// 1. Playwright smoke + a11y results
if (fs.existsSync(PLAYWRIGHT_RESULTS)) {
  const pw = JSON.parse(fs.readFileSync(PLAYWRIGHT_RESULTS, "utf-8"));
  for (const suite of pw.suites || []) {
    walkSuite(suite);
  }

  function walkSuite(suite) {
    for (const spec of suite.specs || []) {
      for (const testObj of spec.tests || []) {
        for (const result of testObj.results || []) {
          if (result.status === "failed" || result.status === "timedOut") {
            const isA11y = spec.title.startsWith("a11y:");
            const isSmoke = spec.title.startsWith("smoke:");
            const severity = isA11y ? "important" : "critical";
            const area = isA11y ? "Accessibility" : isSmoke ? "Functional" : "Test";

            // Extract target page from title
            const m = spec.title.match(/(?:smoke|a11y):\s+(\S+)/);
            const target = m ? m[1] : spec.title;

            const errMsg = (result.errors || []).map((e) => e.message).join(" | ").slice(0, 500);
            addFinding({
              severity,
              area,
              target,
              finding: `${spec.title} failed: ${errMsg}`,
              fix: `Investigate ${target} — check Playwright report at test-results/html-report/index.html`,
              estMin: isA11y ? 20 : 45,
            });
          }
        }
      }
    }
    for (const child of suite.suites || []) walkSuite(child);
  }
}

// 2. Axe detailed findings (beyond pass/fail summary from Playwright)
const axeFiles = fs.readdirSync(RUN_DIR).filter((f) => f.startsWith("axe") && f.endsWith(".json"));
for (const file of axeFiles) {
  const data = JSON.parse(fs.readFileSync(path.join(RUN_DIR, file), "utf-8"));
  for (const v of data.critical || []) {
    addFinding({
      severity: v.impact === "critical" ? "critical" : "important",
      area: "Accessibility",
      target: data.page,
      finding: `${v.id}: ${v.help} (${v.nodes.length} element${v.nodes.length === 1 ? "" : "s"})`,
      fix: v.helpUrl ? `See ${v.helpUrl}` : "Fix axe rule violations",
      estMin: 15,
    });
  }
}

// 3. PSI perf issues
const psiFile = path.join(RUN_DIR, "psi.json");
if (fs.existsSync(psiFile)) {
  const psi = JSON.parse(fs.readFileSync(psiFile, "utf-8"));
  for (const issue of psi.issues || []) {
    addFinding({
      severity: issue.severity,
      area: "Performance",
      target: issue.page,
      finding: issue.msg,
      fix: perfFix(issue.metric),
      estMin: 60,
    });
  }
}

function perfFix(metric) {
  const fixes = {
    LCP: "Optimise largest image: use next/image, add priority, preload hero, check server response time",
    CLS: "Reserve space for images (width/height attrs), avoid dynamic content injection above the fold",
    INP: "Reduce JavaScript work on interactions, use React Server Components, debounce heavy handlers",
    TBT: "Code-split large bundles, lazy-load non-critical JS, check for blocking third-party scripts",
    "Perf Score": "See Lighthouse report for specific audits; usually LCP + TBT are the biggest levers",
  };
  return fixes[metric] || "See Lighthouse report for details";
}

// 4. Bundle size issues
const bundleFile = path.join(RUN_DIR, "bundle-check.json");
if (fs.existsSync(bundleFile)) {
  const bundle = JSON.parse(fs.readFileSync(bundleFile, "utf-8"));
  for (const issue of bundle.issues || []) {
    addFinding({
      severity: issue.severity,
      area: "Bundle Size",
      target: issue.route,
      finding: issue.msg,
      fix: "Check for heavy dependencies. Consider dynamic import() for rarely-used code. Look for full-library imports (e.g. lodash, date-fns) that could be tree-shaken.",
      estMin: 45,
    });
  }
}

// 5. API smoke failures
const apiLog = path.join(RUN_DIR, "api-smoke.log");
if (fs.existsSync(apiLog)) {
  const log = fs.readFileSync(apiLog, "utf-8");
  const failMatches = log.matchAll(/--- (\w+) ([^\n]+)\n\s*Status: (\d+)\n\s*FAIL: ([^\n]+)/g);
  for (const m of failMatches) {
    const [, method, endpoint, status, reason] = m;
    addFinding({
      severity: "critical",
      area: "API",
      target: `${method} ${endpoint}`,
      finding: `Returned ${status}: ${reason}`,
      fix: `Check the route handler at src/app/api${endpoint}/route.ts — look at recent changes`,
      estMin: 30,
    });
  }
}

// 6. UX scores (if present)
const uxFile = path.join(RUN_DIR, "ux-scores.json");
if (fs.existsSync(uxFile)) {
  const ux = JSON.parse(fs.readFileSync(uxFile, "utf-8"));
  for (const page of Object.keys(ux)) {
    for (const item of ux[page] || []) {
      if (item.severity && item.severity !== "nice") {
        addFinding({
          severity: item.severity,
          area: `UX: ${item.heuristic}`,
          target: page,
          finding: item.observation,
          fix: item.fix,
          estMin: 30,
        });
      }
    }
  }
}

// Rank: critical → important → nice, then shortest est. first within severity
const SEV_ORDER = { critical: 0, important: 1, nice: 2 };
findings.sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity] || a.estMin - b.estMin);

// Renumber after sort
findings.forEach((f, i) => (f.id = i + 1));

// Write punch-list.md
const md = [];
md.push(`# Quality Sweep — Punch List`);
md.push(``);
md.push(`**Run ID:** ${RUN_ID}`);
md.push(`**Generated:** ${new Date().toISOString()}`);
md.push(``);
md.push(`## Summary`);
md.push(``);
const critical = findings.filter((f) => f.severity === "critical").length;
const important = findings.filter((f) => f.severity === "important").length;
const nice = findings.filter((f) => f.severity === "nice").length;
md.push(`| Severity | Count |`);
md.push(`|---|---|`);
md.push(`| Critical | ${critical} |`);
md.push(`| Important | ${important} |`);
md.push(`| Nice | ${nice} |`);
md.push(`| **Total** | **${findings.length}** |`);
md.push(``);

if (findings.length === 0) {
  md.push(`## No issues found`);
  md.push(``);
  md.push(`All workstreams passed. 🎉`);
} else {
  md.push(`## Findings`);
  md.push(``);
  md.push(`| # | Severity | Area | Target | Finding | Fix | Est. min |`);
  md.push(`|---|---|---|---|---|---|---|`);
  for (const f of findings) {
    const escapedFinding = f.finding.replace(/\|/g, "\\|").replace(/\n/g, " ").slice(0, 300);
    const escapedFix = f.fix.replace(/\|/g, "\\|").replace(/\n/g, " ").slice(0, 300);
    md.push(`| ${f.id} | ${f.severity} | ${f.area} | \`${f.target}\` | ${escapedFinding} | ${escapedFix} | ${f.estMin} |`);
  }
}

md.push(``);
md.push(`## Top 3 Critical (to tackle first)`);
md.push(``);
const top3 = findings.filter((f) => f.severity === "critical").slice(0, 3);
if (top3.length === 0) {
  md.push(`No critical findings.`);
} else {
  for (const f of top3) {
    md.push(`### #${f.id} — ${f.area}: ${f.target}`);
    md.push(``);
    md.push(`**Finding:** ${f.finding}`);
    md.push(``);
    md.push(`**Fix:** ${f.fix}`);
    md.push(``);
    md.push(`**Est:** ${f.estMin} min`);
    md.push(``);
  }
}

fs.writeFileSync(path.join(RUN_DIR, "punch-list.md"), md.join("\n"));
fs.writeFileSync(
  path.join(RUN_DIR, "summary.json"),
  JSON.stringify({ runId: RUN_ID, counts: { critical, important, nice, total: findings.length }, findings }, null, 2)
);

console.log(`\nPunch list: ${RUN_DIR}/punch-list.md`);
console.log(`Summary:    ${RUN_DIR}/summary.json`);
console.log(`\n${critical} critical, ${important} important, ${nice} nice`);
