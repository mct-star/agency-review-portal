import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config for quality sweep.
 *
 * Tests run against the deployed URL (agency-review-portal.vercel.app by default)
 * so we measure real production performance including Vercel's edge cache.
 *
 * Env vars (in .env.local):
 *   TEST_BASE_URL          - defaults to https://agency-review-portal.vercel.app
 *   TEST_EMAIL             - admin login email (required for auth)
 *   TEST_PASSWORD          - admin login password (required for auth)
 *   VERCEL_BYPASS_TOKEN    - if Deployment Protection is on
 */

import { config as dotenvConfig } from "dotenv";
dotenvConfig({ path: ".env.local" });

const baseURL = process.env.TEST_BASE_URL || "https://agency-review-portal.vercel.app";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false, // Sequential to avoid auth race conditions
  workers: 1,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: [
    ["list"],
    ["html", { outputFolder: "test-results/html-report", open: "never" }],
    ["json", { outputFile: "test-results/results.json" }],
  ],
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    extraHTTPHeaders: process.env.VERCEL_BYPASS_TOKEN
      ? { "x-vercel-protection-bypass": process.env.VERCEL_BYPASS_TOKEN }
      : undefined,
  },
  projects: [
    {
      name: "setup",
      testMatch: /auth\.setup\.ts/,
    },
    {
      name: "chromium",
      dependencies: ["setup"],
      use: {
        ...devices["Desktop Chrome"],
        storageState: "tests/.auth/admin.json",
      },
      testIgnore: /auth\.setup\.ts/,
    },
  ],
});
