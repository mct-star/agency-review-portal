import { expect, test } from "@playwright/test";
import { createServer, type ViteDevServer } from "vite";
import path from "node:path";

let fixture: ViteDevServer;
let fixtureUrl: string;
const companyId = "22222222-2222-4222-8222-222222222222";

test.beforeAll(async () => {
  fixture = await createServer({
    configFile: false, appType: "custom", root: path.resolve(__dirname, "../.."), cacheDir: "node_modules/.vite/calendar-handoffs",
    server: { host: "127.0.0.1", port: 0 }, oxc: { jsx: { runtime: "automatic" } },
    optimizeDeps: { exclude: ["next/navigation", "next/link"] },
    resolve: { alias: [{ find: "@", replacement: path.resolve(__dirname, "../../src") }] },
    plugins: [{
      name: "isolated-calendar-navigation", enforce: "pre",
      resolveId(id) {
        if (id === "next/navigation") return "\0fixture-navigation";
        if (id === "next/link") return "\0fixture-link";
      },
      load(id) {
        if (id === "\0fixture-navigation") return 'export const useRouter = () => ({ push: (href) => { window.fixtureNavigation = href; } });';
        if (id === "\0fixture-link") return 'import React from "react"; export default function Link(props) { return React.createElement("a", props); }';
      },
    }],
  });
  fixture.middlewares.use(async (request, response, next) => {
    if (request.url !== "/") return next();
    response.setHeader("Content-Type", "text/html");
    response.end(await fixture.transformIndexHtml("/", `<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1"><div id="root" class="workspace workspace-content"></div><script type="module">
      import "/src/app/globals.css";
      import "/src/app/(app)/workspace.css";
      import React from "react"; import { createRoot } from "react-dom/client";
      import ContentCalendar from "/src/components/calendar/ContentCalendar.tsx";
      import QuickGenerate from "/src/components/generate/QuickGenerate.tsx";
      const root = createRoot(document.getElementById("root")); let key = 0;
      const companies = [{ id:"company-a", name:"Alphabetical first", brand_color:null }, { id:"${companyId}", name:"Chosen company", brand_color:null }];
      window.renderCalendar = () => root.render(React.createElement(ContentCalendar, { key:String(key++), companies, initialCompanyId:"${companyId}", initialDate:"2027-01-01", showCompanyPicker:true }));
      window.renderQuick = (options = {}) => root.render(React.createElement(QuickGenerate, {
        key:String(key++), companies:companies.map(c => ({ ...c, authorName:"Author", authorTagline:"", brandColor:"#111111" })),
        initialCompanyId:"${companyId}", initialScheduledDate:"2027-01-01", initialScheduledTime:"16:45", initialTopic:"A useful idea", initialPostType:"insight", ...options,
      }));
      window.renderCalendar();
      </script>`));
  });
  await fixture.listen();
  fixtureUrl = fixture.resolvedUrls!.local[0];
});
test.afterAll(async () => { await fixture?.close(); });

test.beforeEach(async ({ page }) => {
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/calendar") return route.fulfill({ json: { weeks: [], pieces: [], slots: [{ id:"slot-friday", day_of_week:5, scheduled_time:"16:45:00", post_type_id:"insight", slot_label:"Useful insight", post_types:{ slug:"insight", label:"Useful insight", content_type:"social_post" } }] } });
    if (url.pathname === "/api/me") return route.fulfill({ json: { data:{ role:"admin" } } });
    if (url.pathname === "/api/generate/quick") return route.fulfill({ json: { postText:"A generated draft for review.", firstComment:null, imageUrl:null } });
    return route.fulfill({ json: { data:[], accounts:[] } });
  });
  await page.goto(fixtureUrl);
  await expect(page.getByLabel("Select company")).toHaveValue(companyId);
});

test("month and week ghost slots retain the selected company, exact date and time without a week row", async ({ page }) => {
  if (page.viewportSize()!.width < 640) {
    const link = page.getByRole("link", { name:"Create Useful insight at 4:45pm", exact:true });
    const href = (await link.getAttribute("href"))!;
    const params = new URL(href, "https://example.test").searchParams;
    expect(Object.fromEntries(params)).toEqual({ company:companyId, date:"2027-01-01", time:"16:45:00", postType:"insight" });
    await page.getByRole("button", { name:"Month", exact:true }).click();
    await expect(page.getByRole("link", { name:"Create Useful insight at 4:45pm", exact:true }).first()).toHaveAttribute("href", href);
    return;
  }
  await page.getByRole("button", { name:/Useful insight/ }).click();
  const target = () => page.evaluate(() => (window as unknown as { fixtureNavigation:string }).fixtureNavigation);
  await expect.poll(target).toContain("date=2027-01-01");
  let params = new URL(await target(), "https://example.test").searchParams;
  expect(Object.fromEntries(params)).toEqual({ company:companyId, date:"2027-01-01", time:"16:45:00", postType:"insight" });
  await page.getByRole("button", { name:"Month", exact:true }).click();
  await page.getByRole("button", { name:/Useful insight/ }).first().click();
  params = new URL(await target(), "https://example.test").searchParams;
  expect(params.get("company")).toBe(companyId);
  expect(params.get("date")).toBe("2027-01-01");
  expect(params.get("time")).toBe("16:45:00");
});

test("phone calendar offers the same dated quick-create action", async ({ page }) => {
  await page.setViewportSize({ width:390, height:844 });
  const link = page.getByRole("link", { name:"Create Useful insight at 4:45pm", exact:true });
  await expect(link).toBeVisible();
  const params = new URL((await link.getAttribute("href"))!, "https://example.test").searchParams;
  expect(Object.fromEntries(params)).toEqual({ company:companyId, date:"2027-01-01", time:"16:45:00", postType:"insight" });
});

test("Quick Post displays and saves the retained slot as a pending review draft, with a scoped return", async ({ page }) => {
  await page.evaluate(() => (window as unknown as { renderQuick:() => void }).renderQuick());
  await expect(page.getByText(/Planned draft for Friday, 1 January 2027 at 16:45/)).toBeVisible();
  await page.getByRole("button", { name:"Generate Post", exact:true }).click();
  let saved: Record<string,unknown> | null = null;
  await page.route("**/api/content/pieces", async (route) => { saved=route.request().postDataJSON(); await route.fulfill({ json:{ id:"saved" } }); });
  await page.getByRole("button", { name:"Send to review", exact:true }).click();
  await expect(page.getByRole("link", { name:"View planned draft", exact:true })).toBeVisible();
  expect(saved).toMatchObject({ companyId, scheduledDate:"2027-01-01", scheduledTime:"16:45", unscheduled:false, status:"draft" });
  await expect(page.getByRole("link", { name:"View planned draft", exact:true })).toHaveAttribute("href", `/calendar?companyId=${companyId}&date=2027-01-01`);
});

test("hosted formats send the calendar slot to the durable queue before polling finishes", async ({ page }) => {
  let queued: Record<string,unknown> | null = null;
  await page.route("**/api/admin/single-post", async (route) => { queued=route.request().postDataJSON(); await route.fulfill({ json:{ data:{ job:{ id:"queued-job", status:"queued" } } } }); });
  await page.evaluate(() => (window as unknown as { renderQuick:(options:object) => void }).renderQuick({ initialPostType:"meme" }));
  await page.getByRole("button", { name:"Generate Post", exact:true }).click();
  await expect.poll(() => queued).toMatchObject({ companyId, postDate:"2027-01-01", postTime:"16:45", postTypeSlug:"meme" });
  await page.evaluate(() => (window as unknown as { renderCalendar:() => void }).renderCalendar());
});
