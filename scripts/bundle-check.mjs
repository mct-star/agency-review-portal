#!/usr/bin/env node
/**
 * Bundle size checker.
 * Runs `next build`, parses the route-size table, flags anomalies.
 * Persists baseline to sweep-results/bundle-baseline.json for regression detection.
 */

import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const RUN_ID = process.env.SWEEP_RUN_ID || new Date().toISOString().slice(0, 13).replace(/[-:T]/g, "");
const OUT_DIR = path.join("sweep-results", RUN_ID);
const BASELINE_FILE = path.join("sweep-results", "bundle-baseline.json");

fs.mkdirSync(OUT_DIR, { recursive: true });

console.log("Running next build...");
let buildOutput;
try {
  buildOutput = execSync("npx next build 2>&1", { encoding: "utf-8", maxBuffer: 50 * 1024 * 1024 });
} catch (err) {
  console.error("Build failed:");
  console.error(err.stdout);
  fs.writeFileSync(path.join(OUT_DIR, "bundle-check.json"), JSON.stringify({ error: "Build failed", stdout: err.stdout?.slice(-5000) }, null, 2));
  process.exit(1);
}

fs.writeFileSync(path.join(OUT_DIR, "build-output.log"), buildOutput);

// Parse the Next.js route table. Format varies by version but we look for lines like:
//   ┌ ○ /                              1.23 kB    234 kB
//   ├ ƒ /api/generate/quick            0 B        0 B
function parseRoutes(output) {
  const routes = [];
  const lines = output.split("\n");
  const routePattern = /^[┌├└│\s]*[○◦●ƒλ]\s+(\/[^\s]*)\s+([\d.]+)\s*(B|kB|MB)\s+([\d.]+)\s*(B|kB|MB)/;

  for (const line of lines) {
    const m = line.match(routePattern);
    if (m) {
      const [, route, size, sizeUnit, firstLoad, firstLoadUnit] = m;
      routes.push({
        route,
        size: toKB(parseFloat(size), sizeUnit),
        firstLoadKB: toKB(parseFloat(firstLoad), firstLoadUnit),
      });
    }
  }
  return routes;
}

function toKB(value, unit) {
  if (unit === "B") return value / 1024;
  if (unit === "kB") return value;
  if (unit === "MB") return value * 1024;
  return value;
}

const routes = parseRoutes(buildOutput);
console.log(`\nParsed ${routes.length} routes`);

const issues = [];

// Flag routes with First Load > 500kB
for (const r of routes) {
  if (r.firstLoadKB > 1000) {
    issues.push({ severity: "critical", route: r.route, firstLoadKB: r.firstLoadKB, msg: `First Load JS ${r.firstLoadKB.toFixed(0)}kB > 1MB (critical)` });
  } else if (r.firstLoadKB > 500) {
    issues.push({ severity: "important", route: r.route, firstLoadKB: r.firstLoadKB, msg: `First Load JS ${r.firstLoadKB.toFixed(0)}kB > 500kB (important)` });
  }
}

// Compare to baseline for regressions
let baseline = {};
if (fs.existsSync(BASELINE_FILE)) {
  baseline = JSON.parse(fs.readFileSync(BASELINE_FILE, "utf-8"));
}

for (const r of routes) {
  const prev = baseline[r.route];
  if (prev && r.firstLoadKB > prev * 1.1) {
    issues.push({
      severity: "important",
      route: r.route,
      firstLoadKB: r.firstLoadKB,
      baselineKB: prev,
      msg: `First Load JS grew ${((r.firstLoadKB / prev - 1) * 100).toFixed(1)}% (${prev.toFixed(0)}kB → ${r.firstLoadKB.toFixed(0)}kB)`,
    });
  }
}

// Update baseline
const newBaseline = {};
for (const r of routes) newBaseline[r.route] = r.firstLoadKB;
fs.writeFileSync(BASELINE_FILE, JSON.stringify(newBaseline, null, 2));

fs.writeFileSync(
  path.join(OUT_DIR, "bundle-check.json"),
  JSON.stringify({ routes, issues }, null, 2)
);

console.log(`\nBundle issues found: ${issues.length}`);
for (const i of issues.slice(0, 10)) {
  console.log(`  [${i.severity}] ${i.route}: ${i.msg}`);
}

console.log(`\nWritten to ${OUT_DIR}/bundle-check.json`);
console.log(`Baseline updated: ${BASELINE_FILE}`);
