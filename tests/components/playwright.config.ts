import { defineConfig } from "@playwright/test";
import { existsSync } from "node:fs";

/** Isolated component checks use local fixtures and mocked APIs, with no sign-in. */
export default defineConfig({
  testDir: ".",
  testMatch: "*.spec.ts",
  workers: 1,
  reporter: "list",
  projects: [
    { name: "desktop", use: { viewport: { width: 1440, height: 900 } } },
    { name: "mobile", use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
  ],
  use: {
    headless: true,
    channel: existsSync("/Applications/Google Chrome.app") ? "chrome" : undefined,
  },
});
