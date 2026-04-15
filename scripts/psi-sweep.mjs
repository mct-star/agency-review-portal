#!/usr/bin/env node
/**
 * PageSpeed Insights sweep.
 * Runs PSI against the deployed URL for each priority page,
 * extracts LCP/CLS/INP/TBT, writes to sweep-results/<run>/psi.json.
 *
 * Free tier: 400 requests per 100s, 25k per day — plenty for this.
 * PSI_API_KEY is optional but raises quota.
 */

import fs from "node:fs";
import path from "node:path";
import { config as dotenvConfig } from "dotenv";

dotenvConfig({ path: ".env.local" });

const BASE_URL = process.env.TEST_BASE_URL || "https://agency-review-portal.vercel.app";
const API_KEY = process.env.PSI_API_KEY || "";
const RUN_ID = process.env.SWEEP_RUN_ID || new Date().toISOString().slice(0, 13).replace(/[-:T]/g, "");
const OUT_DIR = path.join("sweep-results", RUN_ID);

fs.mkdirSync(OUT_DIR, { recursive: true });

// The 5 highest-traffic pages — keep it tight to avoid rate-limit issues
const PAGES = ["/home", "/generate/quick", "/review", "/compliance", "/calendar"];

async function runPSI(pageUrl, strategy = "mobile") {
  const url = new URL("https://www.googleapis.com/pagespeedonline/v5/runPagespeed");
  url.searchParams.set("url", pageUrl);
  url.searchParams.set("strategy", strategy);
  url.searchParams.set("category", "performance");
  url.searchParams.set("category", "accessibility");
  url.searchParams.set("category", "best-practices");
  if (API_KEY) url.searchParams.set("key", API_KEY);

  const res = await fetch(url.toString());
  if (!res.ok) {
    return { error: `PSI ${res.status}: ${await res.text()}` };
  }
  return await res.json();
}

function extractMetrics(psiResult) {
  if (psiResult.error) return { error: psiResult.error };

  const audits = psiResult.lighthouseResult?.audits || {};
  const categories = psiResult.lighthouseResult?.categories || {};

  return {
    scores: {
      performance: categories.performance?.score ? Math.round(categories.performance.score * 100) : null,
      accessibility: categories.accessibility?.score ? Math.round(categories.accessibility.score * 100) : null,
      bestPractices: categories["best-practices"]?.score ? Math.round(categories["best-practices"].score * 100) : null,
    },
    lcp: audits["largest-contentful-paint"]?.numericValue ?? null,
    cls: audits["cumulative-layout-shift"]?.numericValue ?? null,
    tbt: audits["total-blocking-time"]?.numericValue ?? null,
    fcp: audits["first-contentful-paint"]?.numericValue ?? null,
    speedIndex: audits["speed-index"]?.numericValue ?? null,
    tti: audits["interactive"]?.numericValue ?? null,
    // Real-user INP comes from the loadingExperience block
    inp: psiResult.loadingExperience?.metrics?.INTERACTION_TO_NEXT_PAINT_MS?.percentile ?? null,
  };
}

function flagIssues(metrics, page) {
  const issues = [];
  if (metrics.error) return [{ severity: "critical", msg: metrics.error }];

  if (metrics.lcp != null && metrics.lcp > 4000) {
    issues.push({ severity: "critical", page, metric: "LCP", value: Math.round(metrics.lcp), threshold: 4000, msg: `LCP ${Math.round(metrics.lcp)}ms (critical > 4000ms)` });
  } else if (metrics.lcp != null && metrics.lcp > 2500) {
    issues.push({ severity: "important", page, metric: "LCP", value: Math.round(metrics.lcp), threshold: 2500, msg: `LCP ${Math.round(metrics.lcp)}ms (important > 2500ms)` });
  }
  if (metrics.cls != null && metrics.cls > 0.25) {
    issues.push({ severity: "critical", page, metric: "CLS", value: metrics.cls, threshold: 0.25, msg: `CLS ${metrics.cls.toFixed(3)} (critical > 0.25)` });
  } else if (metrics.cls != null && metrics.cls > 0.1) {
    issues.push({ severity: "important", page, metric: "CLS", value: metrics.cls, threshold: 0.1, msg: `CLS ${metrics.cls.toFixed(3)} (important > 0.1)` });
  }
  if (metrics.tbt != null && metrics.tbt > 600) {
    issues.push({ severity: "important", page, metric: "TBT", value: Math.round(metrics.tbt), threshold: 600, msg: `TBT ${Math.round(metrics.tbt)}ms (important > 600ms)` });
  }
  if (metrics.inp != null && metrics.inp > 500) {
    issues.push({ severity: "critical", page, metric: "INP", value: metrics.inp, threshold: 500, msg: `INP ${metrics.inp}ms (critical > 500ms)` });
  } else if (metrics.inp != null && metrics.inp > 200) {
    issues.push({ severity: "important", page, metric: "INP", value: metrics.inp, threshold: 200, msg: `INP ${metrics.inp}ms (important > 200ms)` });
  }
  if (metrics.scores.performance != null && metrics.scores.performance < 50) {
    issues.push({ severity: "critical", page, metric: "Perf Score", value: metrics.scores.performance, msg: `Perf score ${metrics.scores.performance}/100 (critical < 50)` });
  } else if (metrics.scores.performance != null && metrics.scores.performance < 90) {
    issues.push({ severity: "important", page, metric: "Perf Score", value: metrics.scores.performance, msg: `Perf score ${metrics.scores.performance}/100 (important < 90)` });
  }
  return issues;
}

async function main() {
  const results = {};
  const allIssues = [];

  console.log(`PSI sweep against ${BASE_URL}`);
  console.log(`Run ID: ${RUN_ID}`);
  console.log(`API key: ${API_KEY ? "yes" : "no (using unauthenticated quota)"}`);
  console.log("");

  for (const page of PAGES) {
    const url = `${BASE_URL}${page}`;
    process.stdout.write(`  ${page} (mobile)... `);
    const psi = await runPSI(url, "mobile");
    const metrics = extractMetrics(psi);
    results[page] = { mobile: metrics };

    const issues = flagIssues(metrics, page);
    allIssues.push(...issues);

    if (metrics.error) {
      console.log(`ERROR — ${metrics.error}`);
    } else {
      const flags = issues.length > 0 ? ` [${issues.length} issues]` : "";
      console.log(
        `Perf ${metrics.scores.performance ?? "?"} | LCP ${metrics.lcp ? Math.round(metrics.lcp) : "?"}ms | CLS ${metrics.cls?.toFixed(3) ?? "?"}${flags}`
      );
    }

    // Rate limit: 1 call per second without key, 100 per 100s with key
    await new Promise((r) => setTimeout(r, API_KEY ? 300 : 1200));
  }

  fs.writeFileSync(path.join(OUT_DIR, "psi.json"), JSON.stringify({ baseUrl: BASE_URL, results, issues: allIssues }, null, 2));

  console.log("");
  console.log(`PSI results written to ${OUT_DIR}/psi.json`);
  console.log(`Total issues: ${allIssues.length} (${allIssues.filter((i) => i.severity === "critical").length} critical)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
