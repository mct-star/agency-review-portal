import { test, expect } from "@playwright/test";
import { createServer, type ViteDevServer } from "vite";
import path from "node:path";

let fixture: ViteDevServer;
let fixtureUrl: string;

test.beforeAll(async () => {
  fixture = await createServer({
    configFile: false, appType: "custom", root: path.resolve(__dirname, "../.."),
    server: { host: "127.0.0.1", port: 0 },
    oxc: { jsx: { runtime: "automatic" } },
    resolve: { alias: [{ find: "@", replacement: path.resolve(__dirname, "../../src") }] },
    plugins: [{
      name: "connection-fixture-navigation", enforce: "pre",
      resolveId(id) { if (id === "next/navigation" || id === "next/link") return `\0fixture-${id}`; },
      load(id) {
        if (id === "\0fixture-next/navigation") return 'let search = window.location.search; let params = new URLSearchParams(search); export const useSearchParams = () => { if (search !== window.location.search) { search = window.location.search; params = new URLSearchParams(search); } return params; };';
        if (id === "\0fixture-next/link") return 'import React from "react"; export default function Link(props) { return React.createElement("a", props); }';
      },
    }],
  });
  fixture.middlewares.use(async (request, response, next) => {
    if (request.url?.split("?")[0] !== "/") return next();
    response.setHeader("Content-Type", "text/html");
    response.end(await fixture.transformIndexHtml("/", `<!doctype html><div id="root"></div><script type="module">
      import React from "react";
      import { createRoot } from "react-dom/client";
      import CompanyConnections from "/src/components/connections/CompanyConnections.tsx";
      const root = createRoot(document.getElementById("root"));
      const params = new URLSearchParams(window.location.search);
      window.renderConnections = (props = {}) => root.render(React.createElement(CompanyConnections, {
        companyId: "company-a", userId: "user-a", canPublish: params.get("canPublish") !== "0", canConnect: params.get("canConnect") !== "0", ...props,
      }));
      window.renderConnections();
    </script>`));
  });
  await fixture.listen();
  fixtureUrl = fixture.resolvedUrls!.local[0];
});
test.afterAll(async () => { await fixture?.close(); });

test.beforeEach(async ({ page }) => {
  await page.route("**/api/publish/linkedin-direct?*", (route) => route.fulfill({ json: { configured: true, accounts: [{ id: "li-a", accountName: "Example profile", usable: true, expiresAt: null }] } }));
  await page.route("**/api/publish/meta?*", (route) => route.fulfill({ json: { configured: true, accounts: [
    { id: "fb-a", platform: "facebook", accountName: "Example Page", pageId: "page-a", accountId: "page-a", usable: true },
    { id: "ig-a", platform: "instagram", accountName: "example", pageId: "page-a", accountId: "instagram-a", usable: true },
  ] } }));
  await page.route("**/api/publish/social?*", (route) => route.fulfill({ json: { configured: { bluesky: true, threads: true, twitter: true, youtube: true, pinterest: true }, accounts: [{ id: "threads-a", platform: "threads", accountName: "Example Threads", usable: false }], pieces: [] } }));
});

test("Settings manages every provider with one action per Meta Page and no publishing form", async ({ page }) => {
  const queueRequests: string[] = [];
  page.on("request", (request) => { if (request.url().includes("/api/publish/jobs")) queueRequests.push(request.url()); });
  await page.goto(fixtureUrl);
  await expect(page.getByText("Example profile", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Disconnect Page and Instagram", exact: true })).toHaveCount(1);
  await expect(page.getByRole("link", { name: "Connect LinkedIn", exact: true })).toHaveAttribute("href", "/api/auth/linkedin?companyId=company-a&returnTo=setup");
  await expect(page.getByRole("link", { name: "Connect YouTube", exact: true })).toHaveAttribute("href", "/api/auth/youtube?companyId=company-a&returnTo=setup");
  await expect(page.getByRole("link", { name: "Connect Pinterest", exact: true })).toBeVisible();
  await expect(page.getByText("Example Threads (reconnect needed)")).toBeVisible();
  await expect(page.getByLabel("Approved content", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Add to .*queue/ })).toHaveCount(0);
  expect(queueRequests).toEqual([]);
});

test("publisher can connect Meta while administrator-managed providers have no refused controls", async ({ page }) => {
  await page.goto(`${fixtureUrl}?canConnect=0`);
  await expect(page.getByRole("link", { name: "Connect Facebook and Instagram", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Connect LinkedIn", exact: true })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Connect X", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Disconnect Example Threads", exact: true })).toHaveCount(0);
  await expect(page.getByText("Your administrator manages LinkedIn connections.")).toBeVisible();
});

test("failed status read stays an error and can be retried", async ({ page }) => {
  let attempts = 0;
  await page.route("**/api/publish/linkedin-direct?*", (route) => {
    attempts += 1;
    return attempts === 1 ? route.fulfill({ status: 500, json: { error: "Unavailable" } }) : route.fulfill({ json: { configured: true, accounts: [{ id: "li-a", accountName: "Recovered profile", usable: true }] } });
  });
  await page.goto(fixtureUrl);
  await expect(page.getByRole("alert")).toContainText("Could not load LinkedIn connections");
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(page.getByText("Recovered profile", { exact: true })).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("Meta Page selection finishes before the saved setup return is offered", async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem("connection-return:user-a:company-a", "setup"));
  await page.route("**/api/auth/meta/pages?*", (route) => route.fulfill({ json: { pages: [{ id: "page-a", name: "Example Page", instagram: { id: "instagram-a", username: "example" } }] } }));
  let selected: unknown;
  await page.route("**/api/auth/meta/pages", async (route) => { selected = route.request().postDataJSON(); await route.fulfill({ json: { connected: true } }); });
  await page.goto(`${fixtureUrl}?meta_choose_page=1`);
  await expect(page.getByLabel("Facebook Page", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Continue setup", exact: true })).toHaveCount(0);
  await page.getByLabel("Also connect @example").check();
  await page.getByRole("button", { name: "Save selected account", exact: true }).click();
  await expect(page.getByRole("link", { name: "Continue setup", exact: true })).toHaveAttribute("href", "/setup/company-a/start");
  expect(selected).toEqual({ companyId: "company-a", pageId: "page-a", instagramId: "instagram-a" });
});
