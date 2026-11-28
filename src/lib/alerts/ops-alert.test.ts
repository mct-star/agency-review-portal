import { describe, expect, it, vi } from "vitest";
import { plain, sendOpsAlert, slackText, type OpsAlert } from "./ops-alert";

const alert: OpsAlert = { subject: "Post failed — Michael", fields: [{ label: "Error", value: "Bad — <b>gateway</b> & more" }], fixUrl: "https://example.test/publish" };

describe("plain", () => {
  it("removes em and en dashes and trims length", () => {
    expect(plain("a — b – c")).toBe("a - b - c");
    expect(plain("x".repeat(50), 10)).toHaveLength(10);
  });
});

describe("slackText", () => {
  it("escapes Slack control characters and keeps the fix link", () => {
    const text = slackText(alert);
    expect(text).toContain("&lt;b&gt;gateway&lt;/b&gt; &amp; more");
    expect(text).toContain("<https://example.test/publish>");
    expect(text).not.toMatch(/[—–]/);
  });
});

describe("sendOpsAlert", () => {
  it("skips Slack cleanly when no webhook is set and still emails", async () => {
    const fetchImpl = vi.fn();
    const email = vi.fn(async (_options: { to: string; subject: string; html: string }) => ({ success: true }));
    const out = await sendOpsAlert(alert, ["a@x.test", "b@x.test"], { webhookUrl: null, fetchImpl: fetchImpl as never, email });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(out).toEqual({ delivered: true, slack: "skipped", emailed: 2 });
    expect(email.mock.calls[0][0].subject).not.toMatch(/—/);
  });
  it("posts to the Slack webhook", async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true }));
    const out = await sendOpsAlert(alert, [], { webhookUrl: "https://hooks.example.test/x", fetchImpl: fetchImpl as never, email: vi.fn() });
    expect(out).toMatchObject({ delivered: true, slack: "sent" });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });
  it("reports not delivered when nothing got through, and never throws", async () => {
    const out = await sendOpsAlert(alert, ["a@x.test"], { webhookUrl: "https://hooks.example.test/x", fetchImpl: (async () => { throw new Error("down"); }) as never, email: vi.fn(async () => { throw new Error("no"); }) });
    expect(out).toEqual({ delivered: false, slack: "failed", emailed: 0 });
  });
});
