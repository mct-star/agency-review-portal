import { test, expect, type Route } from "@playwright/test";
import { createServer, type ViteDevServer } from "vite";
import path from "node:path";

let fixture: ViteDevServer;
let fixtureUrl: string;

test.beforeAll(async () => {
  fixture = await createServer({
    configFile: false,
    appType: "custom",
    root: path.resolve(__dirname, "../.."),
    cacheDir: "node_modules/.vite/strategy-dictation",
    server: { host: "127.0.0.1", port: 0 },
    oxc: { jsx: { runtime: "automatic" } },
    optimizeDeps: { exclude: ["next/navigation", "next/link"] },
    resolve: { alias: [{ find: "@", replacement: path.resolve(__dirname, "../../src") }] },
    plugins: [{
      name: "isolated-interview-navigation",
      enforce: "pre",
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
    response.end(await fixture.transformIndexHtml("/", `<!doctype html><div id="root"></div>
      <script type="module">
        import React from "react";
        import { createRoot } from "react-dom/client";
        import StrategyInterview from "/src/components/strategy/StrategyInterview.tsx";
        const root = createRoot(document.getElementById("root"));
        window.renderInterview = (step = 1, responses = {}) => root.render(React.createElement(StrategyInterview, {
          key: String(step), companyId: "company-a", companyName: "Example Company",
          initialSession: { current_step: step, responses }, existingAudiences: [], existingPositioning: null,
        }));
        window.renderInterview();
      </script>`));
  });
  await fixture.listen();
  fixtureUrl = fixture.resolvedUrls!.local[0];
});
test.afterAll(async () => { await fixture?.close(); });

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const runtime = window as unknown as Record<string, unknown>;
    runtime.stoppedTracks = 0;
    const stream = () => ({ getTracks: () => [{ stop: () => { runtime.stoppedTracks = Number(runtime.stoppedTracks) + 1; } }] });
    Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: {
      getUserMedia: () => runtime.delayPermission
        ? new Promise((resolve) => { runtime.grantPermission = () => resolve(stream()); })
        : Promise.resolve(stream()),
    } });
    class Recorder {
      static isTypeSupported(type: string) { return type === "audio/mp4"; }
      state = "inactive";
      mimeType = "audio/mp4";
      onstop: (() => void) | null = null;
      ondataavailable: ((event: { data: Blob }) => void) | null = null;
      onerror: (() => void) | null = null;
      start() { this.state = "recording"; }
      stop() {
        this.state = "inactive";
        queueMicrotask(() => {
          this.ondataavailable?.({ data: new Blob(["recorded speech"], { type: this.mimeType }) });
          this.onstop?.();
        });
      }
    }
    Object.defineProperty(window, "MediaRecorder", { configurable: true, writable: true, value: Recorder });
  });
  await page.goto(fixtureUrl);
  await expect(page.getByLabel("What does your company do?", { exact: true })).toBeVisible();
});

test("appends to the latest answer, locks navigation and persists editable words", async ({ page }) => {
  let release!: () => void;
  const pending = new Promise<void>((resolve) => { release = resolve; });
  let upload!: Promise<FormData>;
  await page.route("**/api/generate/transcribe/voice?companyId=company-a", async (route) => {
    const request = route.request();
    upload = new Request(request.url(), {
      method: "POST", headers: request.headers(), body: new Uint8Array(request.postDataBuffer()!),
    }).formData();
    await pending;
    await route.fulfill({ json: { text: "Spoken detail", provider: "gemini" } });
  });
  const answer = page.getByLabel("What does your company do?", { exact: true });
  await answer.fill("Typed answer");
  await page.getByRole("button", { name: "Dictate what does your company do?", exact: true }).click();
  await expect(page.getByRole("button", { name: "Stop recording", exact: true })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Dictate company name", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Next", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Save & continue later", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Stop recording", exact: true }).click();
  await expect(page.getByRole("button", { name: "Transcribing audio", exact: true })).toBeDisabled();
  await answer.fill("Typed answer edited during transcription");
  release();
  await expect(answer).toHaveValue("Typed answer edited during transcription Spoken detail");
  await expect(page.getByLabel("Company name", { exact: true })).toHaveValue("Example Company");
  const file = (await upload).get("audio") as File;
  expect(file.name).toBe("recording.mp4");
  expect(file.type).toBe("audio/mp4");
  await answer.fill("Final edited answer");
  let saved: Record<string, unknown> | undefined;
  await page.route("**/api/strategy/interview", async (route) => {
    saved = route.request().postDataJSON();
    await route.fulfill({ json: { ok: true } });
  });
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Who Do You Help?" })).toBeVisible();
  expect((saved!.responses as Record<string, { whatDo: string }>)["1"].whatDo).toBe("Final edited answer");
});

test("keeps persona answers in their own fields and prevents removal while busy", async ({ page }) => {
  await page.evaluate(() => (window as unknown as { renderInterview: (step: number, answers: unknown) => void }).renderInterview(2, {
    "2": [
      { id: "first", name: "First", jobTitle: "", seniority: "", primaryProblem: "", searchTerms: "" },
      { id: "second", name: "Second", jobTitle: "", seniority: "", primaryProblem: "Second answer", searchTerms: "" },
    ],
  }));
  let release!: () => void;
  const pending = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/api/generate/transcribe/voice*", async (route) => {
    await pending;
    await route.fulfill({ json: { text: "Extra detail" } });
  });
  await page.getByRole("button", { name: "Dictate what keeps them up at night?", exact: true }).nth(1).click();
  for (const button of await page.getByRole("button", { name: "Remove persona" }).all()) await expect(button).toBeDisabled();
  await expect(page.getByRole("button", { name: "+ Add another persona" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Back", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Stop recording", exact: true }).click();
  release();
  await expect(page.getByLabel("What keeps them up at night?", { exact: true }).nth(1)).toHaveValue("Second answer Extra detail");
  await expect(page.getByLabel("What keeps them up at night?", { exact: true }).nth(0)).toHaveValue("");
});

test("allows cancellation of an ignored microphone prompt and stops a late stream", async ({ page }) => {
  await page.evaluate(() => { (window as unknown as Record<string, unknown>).delayPermission = true; });
  await page.getByRole("button", { name: "Dictate what does your company do?", exact: true }).click();
  await expect(page.getByRole("button", { name: "Next", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Cancel microphone request", exact: true }).click();
  await expect(page.getByRole("button", { name: "Next", exact: true })).toBeEnabled();
  await page.evaluate(() => (window as unknown as { grantPermission: () => void }).grantPermission());
  await expect.poll(() => page.evaluate(() => (window as unknown as Record<string, unknown>).stoppedTracks)).toBe(1);
  await expect(page.getByRole("button", { name: "Stop recording", exact: true })).toHaveCount(0);
});

test("returns to typing after API failure or unsupported browser recording", async ({ page }) => {
  await page.route("**/api/generate/transcribe/voice*", (route: Route) => route.fulfill({ status: 502, json: { error: "You can type instead." } }));
  const answer = page.getByLabel("What does your company do?", { exact: true });
  await answer.fill("Keep these words");
  await page.getByRole("button", { name: "Dictate what does your company do?", exact: true }).click();
  await page.getByRole("button", { name: "Stop recording", exact: true }).click();
  await expect(page.getByText("You can type instead.", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Next", exact: true })).toBeEnabled();
  await expect(answer).toHaveValue("Keep these words");
  await page.evaluate(() => { Object.defineProperty(window, "MediaRecorder", { value: undefined }); });
  await page.getByRole("button", { name: "Dictate what does your company do?", exact: true }).click();
  await expect(page.getByText("Your browser does not support audio recording. You can type instead.", { exact: true })).toBeVisible();
  await answer.fill("Typing still works");
  await expect(answer).toHaveValue("Typing still works");
});

test("offers dictation for every free-text answer across the interview", async ({ page }) => {
  for (const [step, answers] of [[1, 2], [2, 4], [3, 5], [4, 3], [5, 9], [6, 0], [7, 12], [8, 0]]) {
    await page.evaluate((step) => (window as unknown as { renderInterview: (step: number) => void }).renderInterview(step), step);
    await expect(page.getByRole("button", { name: /^Dictate / })).toHaveCount(answers);
  }
});

test("dictates into the voice sample and the selected narrative week", async ({ page }) => {
  await page.route("**/api/generate/transcribe/voice*", (route) => route.fulfill({ json: { text: "Added by voice" } }));
  await page.evaluate(() => (window as unknown as { renderInterview: (step: number, answers: unknown) => void }).renderInterview(4, {
    "4": { toneWords: "Keep this tone", voiceSample: "Original sample" },
  }));
  await page.getByRole("button", { name: "Dictate your voice sample", exact: true }).click();
  await page.getByRole("button", { name: "Stop recording", exact: true }).click();
  await expect(page.getByLabel("Your voice sample", { exact: true })).toHaveValue("Original sample Added by voice");
  await expect(page.getByLabel("How you communicate", { exact: true })).toHaveValue("Keep this tone");

  await page.evaluate(() => {
    const weeks = Array(12).fill("");
    weeks[5] = "Original theme";
    (window as unknown as { renderInterview: (step: number, answers: unknown) => void }).renderInterview(7, { "7": weeks });
  });
  await page.getByRole("button", { name: "Dictate weekly theme", exact: true }).nth(5).click();
  await page.getByRole("button", { name: "Stop recording", exact: true }).click();
  await expect(page.getByLabel("Weekly theme", { exact: true }).nth(5)).toHaveValue("Original theme Added by voice");
  await expect(page.getByLabel("Weekly theme", { exact: true }).nth(0)).toHaveValue("");
});
