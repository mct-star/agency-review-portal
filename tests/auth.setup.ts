import { test as setup, expect } from "@playwright/test";
import path from "path";

/**
 * Auth setup — runs once before all tests.
 * Logs in with TEST_EMAIL/TEST_PASSWORD and saves session to tests/.auth/admin.json.
 * All other tests reuse this storage state.
 */

const authFile = path.join(__dirname, ".auth/admin.json");

setup("authenticate", async ({ page }) => {
  const email = process.env.TEST_EMAIL;
  const password = process.env.TEST_PASSWORD;

  if (!email || !password) {
    throw new Error(
      "TEST_EMAIL and TEST_PASSWORD must be set in .env.local. " +
        "Generate a test user at /signup or use your admin credentials."
    );
  }

  await page.goto("/login");

  // Fill the password-mode form (default)
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: /sign in/i }).click();

  // Wait for redirect to /dashboard or /home (auth callback target)
  await page.waitForURL((url) => /\/(dashboard|home)/.test(url.pathname), {
    timeout: 20_000,
  });

  // Sanity check: we should see the sidebar
  await expect(page.locator("nav, aside").first()).toBeVisible();

  // Persist auth state
  await page.context().storageState({ path: authFile });
  console.log(`[auth] Saved session to ${authFile}`);
});
