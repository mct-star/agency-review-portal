import { defineConfig } from "@playwright/test";
import { existsSync } from "node:fs";

/** Isolated component checks use local fixtures and mocked APIs, with no sign-in. */
export default defineConfig({
  testDir: ".",
  testMatch: "*.spec.ts",
  workers: 1,
  reporter: "list",
  use: {
    headless: true,
    channel: existsSync("/Applications/Google Chrome.app") ? "chrome" : undefined,
  },
});
