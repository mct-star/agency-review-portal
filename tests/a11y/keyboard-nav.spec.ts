import { test, expect } from "@playwright/test";

/**
 * Keyboard navigation tests for complex interactive components.
 * These go beyond generic axe rules because drag-and-drop libraries
 * need custom keyboard handling that axe can't verify.
 */

test("keyboard nav: calendar page is tab-reachable and focus is visible", async ({ page }) => {
  await page.goto("/calendar", { waitUntil: "networkidle" });

  // Tab a few times — at least one focusable element should have a visible focus indicator
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");

  const focusedHasOutline = await page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el || el === document.body) return false;
    const style = window.getComputedStyle(el);
    const hasOutline = style.outlineStyle !== "none" && style.outlineWidth !== "0px";
    const hasBoxShadow = style.boxShadow !== "none";
    const hasBorder = style.borderWidth !== "0px";
    return hasOutline || hasBoxShadow || hasBorder;
  });

  expect.soft(focusedHasOutline, "calendar: focused element must have visible focus indicator").toBe(true);
});

test("keyboard nav: review page kanban cards can receive focus", async ({ page }) => {
  await page.goto("/review", { waitUntil: "networkidle" });

  // Tab until we hit an interactive element or give up after 30 tabs
  let found = false;
  for (let i = 0; i < 30; i++) {
    await page.keyboard.press("Tab");
    const tag = await page.evaluate(() => document.activeElement?.tagName);
    if (tag && ["BUTTON", "A", "INPUT", "SELECT", "TEXTAREA"].includes(tag)) {
      found = true;
      break;
    }
  }

  expect.soft(found, "review page: at least one interactive element is tab-reachable").toBe(true);
});

test("keyboard nav: quick generate form is keyboard-usable", async ({ page }) => {
  await page.goto("/generate/quick", { waitUntil: "networkidle" });

  // The topic textarea should be reachable via Tab
  let reachedTextarea = false;
  for (let i = 0; i < 20; i++) {
    await page.keyboard.press("Tab");
    const tag = await page.evaluate(() => document.activeElement?.tagName);
    if (tag === "TEXTAREA") {
      reachedTextarea = true;
      break;
    }
  }

  expect.soft(reachedTextarea, "quick generate: topic textarea must be keyboard-reachable").toBe(true);
});
