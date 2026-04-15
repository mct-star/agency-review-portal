import { test, expect, Page } from "@playwright/test";

/**
 * Functional smoke test — hits every priority page as an authenticated admin,
 * verifies it renders without JavaScript errors, and checks a sentinel selector.
 *
 * This catches:
 *   - 500 errors on page load
 *   - React/hydration errors (pageerror events)
 *   - Uncaught console.error from client code
 *   - Missing critical UI elements
 */

const PRIORITY_PAGES = [
  { path: "/home", sentinel: "main, [role='main'], h1" },
  { path: "/generate/quick", sentinel: "textarea, [role='textbox']" },
  { path: "/review", sentinel: "main, h1" },
  { path: "/compliance", sentinel: "main, h1" },
  { path: "/calendar", sentinel: "main, h1" },
  { path: "/publish", sentinel: "main, h1" },
  { path: "/analytics", sentinel: "main, h1" },
  { path: "/settings", sentinel: "main, h1" },
  { path: "/strategy", sentinel: "main, h1" },
];

function collectErrors(page: Page) {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];

  page.on("pageerror", (err) => {
    pageErrors.push(err.message);
  });

  page.on("console", (msg) => {
    if (msg.type() === "error") {
      const text = msg.text();
      // Ignore known benign errors (CORS for analytics, missing favicons, etc.)
      if (
        !text.includes("favicon") &&
        !text.includes("Failed to load resource") &&
        !text.toLowerCase().includes("cors")
      ) {
        consoleErrors.push(text);
      }
    }
  });

  return { pageErrors, consoleErrors };
}

for (const { path, sentinel } of PRIORITY_PAGES) {
  test(`smoke: ${path} renders without errors`, async ({ page }) => {
    const { pageErrors, consoleErrors } = collectErrors(page);

    const response = await page.goto(path, { waitUntil: "networkidle" });

    // 1. HTTP status should be < 400
    expect
      .soft(response?.status() ?? 0, `HTTP status for ${path}`)
      .toBeLessThan(400);

    // 2. Sentinel selector should be visible
    await expect
      .soft(page.locator(sentinel).first(), `sentinel selector on ${path}`)
      .toBeVisible({ timeout: 5_000 });

    // 3. No uncaught page errors (React crashes, hydration errors)
    expect
      .soft(pageErrors, `page errors on ${path}`)
      .toEqual([]);

    // 4. No uncaught console.error
    expect
      .soft(consoleErrors, `console errors on ${path}`)
      .toEqual([]);
  });
}
