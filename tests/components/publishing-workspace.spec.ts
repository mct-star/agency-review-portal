import { test, expect, type Page } from "@playwright/test";
import { createServer, type ViteDevServer } from "vite";
import path from "node:path";

let fixture: ViteDevServer;
let fixtureUrl: string;
const contentSelect = (page: Page) => page.getByLabel(/^1\. Approved content/);
const accountSelect = (page: Page) => page.getByLabel(/^2\. Destination account/);
const timeInput = (page: Page) => page.getByLabel(/^3\. Publish time/);
const reviewButton = (page: Page) => page.getByRole("button", { name: "Review publishing details", exact: true });
const samplePieces = [
  { id: "piece-text", title: "Approved text post", content_type: "social_post", week_id: null,
    preview: { linkedin: "Exact LinkedIn words.\nSecond approved line.", meta: "Exact Meta words.", social: "Exact social words.", firstComment: "The exact approved first comment." }, media: { shape: "none", items: [] } },
  { id: "piece-image", title: "Approved image post", content_type: "social_post", week_id: null,
    preview: { linkedin: "Approved image words.", meta: "Approved image caption.", social: "Approved pin caption.", firstComment: null }, media: { shape: "image", items: [{ kind: "image", url: "https://assets.example/photo.jpg", alt: "Approved photograph" }] } },
  { id: "piece-video", title: "Approved rendered video", content_type: "video_script", week_id: null,
    preview: { linkedin: "Approved video words.", meta: "Approved video description.", social: "Approved YouTube description.", firstComment: null }, media: { shape: "video", items: [{ kind: "video", url: "https://assets.example/video.mp4" }] } },
];

test.use({ timezoneId: "Europe/London" });

test.beforeAll(async () => {
  fixture = await createServer({
    configFile: false, appType: "custom", root: path.resolve(__dirname, "../.."),
    cacheDir: path.resolve(__dirname, "../../node_modules/.vite-publishing-fixture"),
    server: { host: "127.0.0.1", port: 0 }, oxc: { jsx: { runtime: "automatic" } },
    resolve: { alias: [{ find: "@", replacement: path.resolve(__dirname, "../../src") }] },
    plugins: [{
      name: "publishing-fixture-navigation", enforce: "pre",
      resolveId(id) { if (id === "next/navigation" || id === "next/link") return `\0publishing-fixture-${id}`; },
      load(id) {
        if (id === "\0publishing-fixture-next/navigation") return 'let search = window.location.search; let params = new URLSearchParams(search); export const useSearchParams = () => { if (search !== window.location.search) { search = window.location.search; params = new URLSearchParams(search); } return params; };';
        if (id === "\0publishing-fixture-next/link") return 'import React from "react"; export default function Link(props) { return React.createElement("a", props); }';
      },
    }],
  });
  fixture.middlewares.use(async (request, response, next) => {
    const pathname = request.url?.split("?")[0];
    if (pathname === "/setup/company-a/social") {
      response.setHeader("Content-Type", "text/html");
      response.end('<!doctype html><h1>Connections settings</h1><a href="/">Back to publishing</a>');
      return;
    }
    if (pathname !== "/") return next();
    response.setHeader("Content-Type", "text/html");
    response.end(await fixture.transformIndexHtml("/", `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><div class="workspace"><main id="root" class="mx-auto max-w-5xl p-4 sm:p-6"></main></div><script type="module">
      import "/src/app/globals.css";
      import "/src/app/(app)/workspace.css";
      import React from "react";
      import { createRoot } from "react-dom/client";
      import PublishingWorkspace from "/src/components/publishing/PublishingWorkspace.tsx";
      const params = new URLSearchParams(window.location.search);
      createRoot(document.getElementById("root")).render(React.createElement(PublishingWorkspace, {
        userId: params.get("userId") || "user-a", companyId: params.get("companyId") || "company-a",
        canPublish: params.get("canPublish") !== "0", isHospitality: params.get("hospitality") === "1",
      }));
    </script>`));
  });
  await fixture.listen(); fixtureUrl = fixture.resolvedUrls!.local[0];
});
test.afterAll(async () => { await fixture?.close(); });

test.beforeEach(async ({ page }) => {
  await page.route("https://assets.example/**", (route) => route.abort());
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    if (request.method() !== "GET") throw new Error(`Unexpected publishing mutation: ${request.method()} ${new URL(request.url()).pathname}`);
    const pathname = new URL(request.url()).pathname;
    const responses: Record<string, unknown> = {
      "/api/publish/approved": { data: samplePieces },
      "/api/publish/jobs": { data: [], count: 0 },
      "/api/publish/linkedin-direct": { configured: true, accounts: [
        { id: "li-a", accountName: "Personal profile A", usable: true },
        { id: "li-b", accountName: "Personal profile B", usable: true },
      ] },
      "/api/publish/meta": { configured: true, enabledNetworks: ["facebook", "instagram"], accounts: [
        { id: "fb-a", platform: "facebook", accountName: "Example Facebook Page", usable: true },
        { id: "ig-a", platform: "instagram", accountName: "example_instagram", usable: true },
      ] },
      "/api/publish/social": { configured: { bluesky: true, threads: true, twitter: true, youtube: true, pinterest: true }, enabledNetworks: ["bluesky", "threads", "x", "youtube", "pinterest"], accounts: [
        { id: "youtube-a", platform: "youtube", accountName: "Example video channel", usable: true },
        { id: "pinterest-a", platform: "pinterest", accountName: "Example Pinterest profile", usable: true },
      ] },
      "/api/auth/pinterest/boards": { boards: [{ id: "board-a", name: "Approved campaign board" }] },
    };
    if (!(pathname in responses)) throw new Error(`Unexpected API read: ${pathname}`);
    await route.fulfill({ json: responses[pathname] });
  });
});

test("shows exact approved preview and first comment, then schedules only the confirmed named account", async ({ page }) => {
  const submissions: unknown[] = [];
  await page.route("**/api/publish/linkedin-direct", async (route) => {
    if (route.request().method() === "GET") return route.fallback();
    submissions.push(route.request().postDataJSON()); await route.fulfill({ status: 201, json: { data: { id: "job-created" } } });
  });
  await page.goto(fixtureUrl);
  await contentSelect(page).selectOption("piece-text");
  await accountSelect(page).selectOption("li-b");
  await timeInput(page).fill("2032-06-17T09:45");
  expect(submissions).toEqual([]);
  await reviewButton(page).click();
  const confirmation = page.getByRole("region", { name: "Confirm publishing details", exact: true });
  await expect(confirmation).toContainText("LinkedIn: Personal profile B");
  await expect(confirmation.getByText(samplePieces[0].preview.linkedin, { exact: true })).toBeVisible();
  await expect(confirmation.getByText(samplePieces[0].preview.firstComment!, { exact: true })).toBeVisible();
  await expect(confirmation).toContainText("Europe/London");
  expect(submissions).toEqual([]);
  await confirmation.getByRole("button", { name: "Confirm schedule", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "scheduled for LinkedIn: Personal profile B" })).toBeVisible();
  expect(submissions).toEqual([{ companyId: "company-a", pieceId: "piece-text", socialAccountId: "li-b", platform: "linkedin_personal", scheduledFor: "2032-06-17T08:45:00.000Z", options: {} }]);
});

test("keeps the selected content, named account and time across a Settings roundtrip", async ({ page }) => {
  await page.goto(fixtureUrl);
  await contentSelect(page).selectOption("piece-text"); await accountSelect(page).selectOption("li-a"); await timeInput(page).fill("2032-06-18T14:20");
  await page.getByRole("link", { name: "Manage connections", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Connections settings", exact: true })).toBeVisible();
  expect(await page.evaluate(() => sessionStorage.getItem("connection-return:user-a:company-a"))).toBe("publish");
  await page.getByRole("link", { name: "Back to publishing", exact: true }).click();
  await expect(contentSelect(page)).toHaveValue("piece-text"); await expect(accountSelect(page)).toHaveValue("li-a"); await expect(timeInput(page)).toHaveValue("2032-06-18T14:20");
  const stored = await page.evaluate(() => JSON.parse(sessionStorage.getItem("agency:publishing:v1:user-a:company-a") || "null"));
  expect(stored).toMatchObject({ pieceId: "piece-text", accountId: "li-a", scheduledFor: "2032-06-18T14:20" });
  expect(JSON.stringify(stored)).not.toContain("Exact LinkedIn words");
});

test("a non-publisher makes no publishing requests and has no queue controls", async ({ page }) => {
  const reads: string[] = [];
  page.on("request", (request) => { if (new URL(request.url()).pathname.startsWith("/api/publish/")) reads.push(request.url()); });
  await page.goto(`${fixtureUrl}?canPublish=0`);
  await expect(page.getByRole("heading", { name: "Publishing permissions", exact: true })).toBeVisible();
  await expect(reviewButton(page)).toHaveCount(0); await expect(page.getByRole("button", { name: /Confirm/ })).toHaveCount(0);
  expect(reads).toEqual([]);
});

test("hospitality reads Meta destinations only and links into its permitted review journey", async ({ page }) => {
  const reads: string[] = [];
  page.on("request", (request) => { const pathname = new URL(request.url()).pathname; if (pathname.startsWith("/api/publish/")) reads.push(pathname); });
  await page.goto(`${fixtureUrl}?hospitality=1`);
  await contentSelect(page).selectOption("piece-text"); await accountSelect(page).selectOption("fb-a");
  await expect(page.getByRole("link", { name: "Review venue content", exact: true })).toHaveAttribute("href", "/review");
  await expect(page.locator('a[href^="/content/"]')).toHaveCount(0);
  expect([...new Set(reads)].sort()).toEqual(["/api/publish/approved", "/api/publish/jobs", "/api/publish/meta"]);
});

test("a partial connection read failure shows retry without inventing an empty approved list", async ({ page }) => {
  let attempts = 0;
  await page.route("**/api/publish/linkedin-direct?*", async (route) => {
    attempts += 1;
    if (attempts === 1) return route.fulfill({ status: 503, json: { error: "Unavailable" } });
    return route.fallback();
  });
  await page.goto(fixtureUrl);
  await expect(page.getByRole("alert")).toContainText("LinkedIn connections");
  await expect(contentSelect(page).getByRole("option", { name: "Approved text post", exact: true })).toHaveCount(1);
  await expect(page.getByText(/No approved content is ready/)).toHaveCount(0);
  await page.getByRole("button", { name: "Retry publishing information", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(accountSelect(page).getByRole("option", { name: "LinkedIn: Personal profile A", exact: true })).toHaveCount(1);
});

test("unsupported destinations and a past schedule block confirmation", async ({ page }) => {
  await page.goto(fixtureUrl); await contentSelect(page).selectOption("piece-text");
  await accountSelect(page).selectOption("ig-a");
  await expect(page.getByRole("status")).toContainText("Instagram needs one image."); await expect(reviewButton(page)).toBeDisabled();
  await accountSelect(page).selectOption("youtube-a");
  await expect(page.getByRole("status")).toContainText("YouTube needs an approved rendered video."); await expect(reviewButton(page)).toBeDisabled();
  await accountSelect(page).selectOption("li-a"); await timeInput(page).fill("2001-06-17T09:45");
  await expect(page.getByRole("status")).toContainText("Choose a future date and time"); await expect(reviewButton(page)).toBeDisabled();
  await expect(page.getByRole("region", { name: "Confirm publishing details", exact: true })).toHaveCount(0);
});

test("an uncertain existing job blocks a duplicate and tells the user to check its destination", async ({ page }) => {
  await page.route("**/api/publish/jobs?*", (route) => route.fulfill({ json: { data: [{ id: "existing-job", content_piece_id: "piece-text", social_account_id: "li-a", target_platform: "linkedin_personal", status: "failed", needs_checking: true, content_piece: { title: "Approved text post" }, social_account: { account_name: "Personal profile A" }, response_payload: { outcome_uncertain: true } }], count: 1 } }));
  await page.goto(fixtureUrl); await contentSelect(page).selectOption("piece-text"); await accountSelect(page).selectOption("li-a");
  await expect(page.getByRole("status")).toContainText("already has a job for this account: Needs checking");
  await expect(page.getByText("Needs checking", { exact: true })).toBeVisible();
  await expect(page.getByText("Check the destination before taking further action. This job was not retried automatically.", { exact: true })).toBeVisible();
  await expect(reviewButton(page)).toBeDisabled();
});

test("YouTube requires the audience answer and confirms the selected visibility before queueing", async ({ page }) => {
  const submissions: unknown[] = [];
  await page.route("**/api/publish/social", async (route) => {
    if (route.request().method() === "GET") return route.fallback();
    submissions.push(route.request().postDataJSON()); await route.fulfill({ status: 201, json: { data: { id: "video-job" } } });
  });
  await page.goto(fixtureUrl); await contentSelect(page).selectOption("piece-video"); await accountSelect(page).selectOption("youtube-a");
  await expect(reviewButton(page)).toBeDisabled();
  await page.getByLabel(/^YouTube visibility/).selectOption("unlisted");
  await page.getByLabel(/^Is this video made for children/).selectOption("no");
  await reviewButton(page).click();
  const confirmation = page.getByRole("region", { name: "Confirm publishing details", exact: true });
  await expect(confirmation).toContainText("unlisted, not made for children"); expect(submissions).toEqual([]);
  await confirmation.getByRole("button", { name: "Confirm queue now", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "queued for YouTube: Example video channel" })).toBeVisible();
  expect(submissions).toEqual([{ companyId: "company-a", pieceId: "piece-video", socialAccountId: "youtube-a", platform: "youtube", scheduledFor: null, options: { privacy: "unlisted", madeForKids: false } }]);
});

test("an older attempt outside recent activity still blocks a duplicate for the selected content", async ({ page }) => {
  let selectedHistoryRead = false;
  await page.route("**/api/publish/jobs?*", (route) => {
    const selected = new URL(route.request().url()).searchParams.get("pieceId");
    if (!selected) return route.fulfill({ json: { data: [], count: 0 } });
    selectedHistoryRead = true;
    return route.fulfill({ json: { data: [{ id: "older-job", content_piece_id: selected, social_account_id: "li-a", target_platform: "linkedin_personal", status: "published", content_piece: { title: "Approved text post" }, social_account: { account_name: "Personal profile A" } }], count: 1 } });
  });
  await page.goto(fixtureUrl); await contentSelect(page).selectOption("piece-text"); await accountSelect(page).selectOption("li-a");
  await expect(page.getByRole("status")).toContainText("already has a job for this account: Published");
  await expect(reviewButton(page)).toBeDisabled(); expect(selectedHistoryRead).toBe(true);
});

test("incomplete selected publishing history blocks confirmation until a complete retry succeeds", async ({ page }) => {
  let selectedAttempts = 0;
  await page.route("**/api/publish/jobs?*", (route) => {
    if (!new URL(route.request().url()).searchParams.has("pieceId")) return route.fulfill({ json: { data: [], count: 0 } });
    selectedAttempts += 1;
    return route.fulfill({ json: { data: [], count: selectedAttempts === 1 ? 201 : 0 } });
  });
  await page.goto(fixtureUrl); await contentSelect(page).selectOption("piece-text"); await accountSelect(page).selectOption("li-a");
  await expect(page.getByRole("alert")).toContainText("Could not check all previous publishing attempts");
  await expect(reviewButton(page)).toBeDisabled();
  await page.getByRole("button", { name: "Retry publishing history", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveCount(0); await expect(reviewButton(page)).toBeEnabled();
});
