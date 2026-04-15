import { test } from "@playwright/test";
import fs from "fs";
import path from "path";

/**
 * UX capture pass — screenshots + DOM outline for each priority page.
 * Feeds the per-page Explore agents that score against Nielsen 10.
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
];

const RUN_ID = process.env.SWEEP_RUN_ID || new Date().toISOString().slice(0, 13).replace(/[-:T]/g, "");
const OUT_DIR = path.join("sweep-results", RUN_ID, "screenshots");

test.beforeAll(() => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
});

for (const pagePath of PRIORITY_PAGES) {
  test(`ux capture: ${pagePath}`, async ({ page, browser }) => {
    const safeName = pagePath.replace(/\//g, "_") || "_root";

    // Desktop — 1440x900
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(pagePath, { waitUntil: "networkidle" });
    await page.waitForTimeout(500); // Let animations settle

    await page.screenshot({
      path: path.join(OUT_DIR, `${safeName}-desktop-fold.png`),
    });
    await page.screenshot({
      path: path.join(OUT_DIR, `${safeName}-desktop-full.png`),
      fullPage: true,
    });

    // Mobile — 390x844 (iPhone 14 Pro)
    const mobileContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
      storageState: "tests/.auth/admin.json",
    });
    const mobilePage = await mobileContext.newPage();
    await mobilePage.goto(pagePath, { waitUntil: "networkidle" });
    await mobilePage.waitForTimeout(500);

    await mobilePage.screenshot({
      path: path.join(OUT_DIR, `${safeName}-mobile-fold.png`),
    });
    await mobilePage.screenshot({
      path: path.join(OUT_DIR, `${safeName}-mobile-full.png`),
      fullPage: true,
    });

    // DOM outline — heading hierarchy + landmarks
    const outline = await page.evaluate(() => {
      const headings = Array.from(
        document.querySelectorAll("h1, h2, h3, h4, h5, h6")
      ).map((h) => ({
        level: h.tagName,
        text: h.textContent?.trim().slice(0, 100),
      }));
      const landmarks = Array.from(
        document.querySelectorAll(
          "header, nav, main, aside, footer, [role='banner'], [role='navigation'], [role='main'], [role='complementary'], [role='contentinfo']"
        )
      ).map((el) => ({
        tag: el.tagName,
        role: el.getAttribute("role"),
        label: el.getAttribute("aria-label"),
      }));
      const buttonCount = document.querySelectorAll("button").length;
      const linkCount = document.querySelectorAll("a").length;
      const inputCount = document.querySelectorAll("input, textarea, select").length;

      return { headings, landmarks, buttonCount, linkCount, inputCount };
    });

    fs.writeFileSync(
      path.join(path.dirname(OUT_DIR), `${safeName}.outline.json`),
      JSON.stringify({ page: pagePath, ...outline }, null, 2)
    );

    await mobileContext.close();
  });
}
