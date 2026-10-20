import { test, expect } from "@playwright/test";
import { createServer, type ViteDevServer } from "vite";
import path from "node:path";

let fixture: ViteDevServer;
let fixtureUrl: string;
const companyId = "11111111-1111-4111-8111-111111111111";

test.beforeAll(async () => {
  fixture = await createServer({
    configFile: false, appType: "custom", root: path.resolve(__dirname, "../.."), cacheDir: "node_modules/.vite/workspace-setup",
    server: { host: "127.0.0.1", port: 0 }, oxc: { jsx: { runtime: "automatic" } },
    optimizeDeps: { exclude: ["next/navigation", "next/link"] },
    resolve: { alias: [{ find: "@", replacement: path.resolve(__dirname, "../../src") }] },
    plugins: [{
      name: "isolated-setup-dependencies", enforce: "pre",
      resolveId(id) {
        if (id === "next/navigation") return "\0fixture-navigation";
        if (id === "next/link") return "\0fixture-link";
        if (id.endsWith("/components/connections/CompanyConnections") || id.endsWith("/components/connections/CompanyConnections.tsx")) return "\0fixture-connections";
      },
      load(id) {
        if (id === "\0fixture-navigation") return 'export const useRouter = () => ({ push: (href) => { window.fixtureNavigation = href; }, replace: (href) => { window.fixtureNavigation = href; }, refresh: () => {} });';
        if (id === "\0fixture-link") return 'import React from "react"; export default function Link(props) { return React.createElement("a", props); }';
        if (id === "\0fixture-connections") return 'import React from "react"; export default function Connections(props) { return React.createElement("div", { "data-testid": "shared-connections", "data-company": props.companyId, "data-return": props.returnTarget, "data-hospitality": String(props.isHospitality), "data-connect": String(props.canConnect) }, props.isHospitality ? "Facebook and Instagram accounts" : "LinkedIn and social accounts"); }';
      },
    }],
  });
  fixture.middlewares.use(async (request, response, next) => {
    if (request.url !== "/") return next();
    response.setHeader("Content-Type", "text/html");
    response.end(await fixture.transformIndexHtml("/", `<!doctype html><div id="root"></div>
      <script type="module">
        import React from "react";
        import { createRoot } from "react-dom/client";
        import WorkspaceSetup from "/src/components/onboarding/WorkspaceSetup.tsx";
        import OnboardingWizard from "/src/components/onboarding/OnboardingWizard.tsx";
        const root = createRoot(document.getElementById("root"));
        let key = 0;
        window.renderSetup = (options = {}) => root.render(React.createElement(WorkspaceSetup, {
          key: String(key++), userId: "user-a", company: { id: "${companyId}", name: "Example Company", description: "A useful service" },
          initialStep: "brand", readiness: { brand: true, voice: false, connections: false, unavailable: false },
          canConnect: false, canPublish: false, ...options,
        }));
        window.renderOnboarding = () => root.render(React.createElement(OnboardingWizard, { key: String(key++), userId: "user-a", userName: "Example Person", initialCompanyName: "Example Company" }));
        window.renderSetup();
      </script>`));
  });
  await fixture.listen();
  fixtureUrl = fixture.resolvedUrls!.local[0];
});
test.afterAll(async () => { await fixture?.close(); });

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(fixtureUrl);
  await expect(page.getByRole("heading", { name: "The essentials for your content" })).toBeVisible();
});

test("keeps the current step when brand or progress saving fails, then resumes the shared connections step", async ({ page }) => {
  const progress: unknown[] = [];
  let brandFails = true;
  let progressFails = false;
  await page.route("**/api/config/company/details", (route) => route.fulfill({ status: brandFails ? 503 : 200, json: brandFails ? { error: "Brand save unavailable" } : { ok: true } }));
  await page.route("**/api/onboarding/progress", async (route) => {
    progress.push(route.request().postDataJSON());
    await route.fulfill({ status: progressFails ? 503 : 200, json: progressFails ? { error: "Progress save unavailable" } : { ok: true } });
  });
  await page.getByRole("button", { name: "Save and continue", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveText("Brand save unavailable");
  expect(progress).toHaveLength(0);
  brandFails = false;
  progressFails = true;
  await page.getByRole("button", { name: "Save and continue", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveText("Progress save unavailable");
  await expect(page.getByRole("heading", { name: "The essentials for your content" })).toBeVisible();
  progressFails = false;
  await page.getByRole("button", { name: "Save and continue", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Help your content sound like you" })).toBeVisible();
  await page.getByRole("button", { name: "Skip for now", exact: true }).click();
  await expect(page.getByTestId("shared-connections")).toHaveAttribute("data-return", "setup");
  await expect(page.getByTestId("shared-connections")).toHaveAttribute("data-company", companyId);
  expect(progress).toContainEqual({ companyId, step: "connections" });
  // The server restores the stored preference on the next render or after OAuth.
  await page.evaluate(() => (window as unknown as { renderSetup: (options: object) => void }).renderSetup({ initialStep: "connections" }));
  await expect(page.getByRole("heading", { name: "Connect where you want to publish" })).toBeVisible();
});

test("does not advance after a voice save failure and permits skipping to content without connecting", async ({ page }) => {
  await page.evaluate(() => (window as unknown as { renderSetup: (options: object) => void }).renderSetup({ initialStep: "voice" }));
  await page.route("**/api/config/voice", (route) => route.fulfill({ status: 503, json: { error: "Voice save unavailable" } }));
  const progress: unknown[] = [];
  await page.route("**/api/onboarding/progress", async (route) => {
    progress.push(route.request().postDataJSON());
    await route.fulfill({ json: { ok: true } });
  });
  await page.getByLabel("How should your writing sound? (optional)").fill("Plain, direct and helpful.");
  await page.getByRole("button", { name: "Save and continue", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveText("Voice save unavailable");
  expect(progress).toHaveLength(0);
  await page.getByRole("button", { name: "Skip for now", exact: true }).click();
  await page.getByRole("button", { name: "Continue to your first post", exact: true }).click();
  await page.getByRole("button", { name: "Create a post", exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { fixtureNavigation: string }).fixtureNavigation)).toBe(`/generate/quick?company=${companyId}`);
});

test("hospitality uses only the relevant steps and reuses the existing company configuration", async ({ page }) => {
  await page.evaluate((companyId) => (window as unknown as { renderSetup: (options: object) => void }).renderSetup({
    company: { id: companyId, name: "Example Venue", post_pack: "hospitality" }, initialStep: "connections",
    readiness: { brand: false, voice: true, connections: false, unavailable: false },
  }), companyId);
  await expect(page.getByRole("button", { name: /Writing voice/ })).toHaveCount(0);
  await expect(page.getByTestId("shared-connections")).toHaveText("Facebook and Instagram accounts");
  await expect(page.getByTestId("shared-connections")).toHaveAttribute("data-connect", "false");
  await expect(page.getByText(/LinkedIn/)).toHaveCount(0);
});

test("creates the no-company workspace once and navigates to the resumable setup", async ({ page }) => {
  await page.evaluate(() => (window as unknown as { renderOnboarding: () => void }).renderOnboarding());
  let release!: () => void;
  const wait = new Promise<void>((resolve) => { release = resolve; });
  let creates = 0;
  await page.route("**/api/onboarding", async (route) => {
    creates++;
    await wait;
    await route.fulfill({ json: { id: companyId } });
  });
  await page.getByRole("button", { name: "Create workspace", exact: true }).click();
  await expect(page.getByRole("button", { name: "Creating workspace...", exact: true })).toBeDisabled();
  release();
  await expect.poll(() => page.evaluate(() => (window as unknown as { fixtureNavigation: string }).fixtureNavigation)).toBe(`/setup/${companyId}/start`);
  expect(creates).toBe(1);
});
