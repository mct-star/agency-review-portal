import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactElement, ReactNode } from "react";

// Drive QuickGenerate's save handler without a browser or external services.
const hooks = vi.hoisted(() => ({ values: [] as unknown[], cursor: 0 }));
vi.mock("react", async (original) => ({
  ...await original<typeof import("react")>(),
  useState: (initial: unknown) => {
    const index = hooks.cursor++;
    if (!(index in hooks.values)) hooks.values[index] = typeof initial === "function" ? initial() : initial;
    return [hooks.values[index], (next: unknown) => { hooks.values[index] = typeof next === "function" ? next(hooks.values[index]) : next; }];
  },
  useMemo: (fn: () => unknown) => fn(),
  useCallback: (fn: unknown) => fn,
  useEffect: () => {},
  useRef: (value: unknown) => ({ current: value }),
}));
vi.mock("@/lib/use-is-admin", () => ({ useIsAdmin: () => false }));
import QuickGenerate from "./QuickGenerate";

const props = {
  companies: [{ id: "ours", name: "Our company", authorName: "Author", authorTagline: "", brandColor: "#111111" }],
  initialCompanyId: "ours",
};
type Node = ReactElement<{ children?: ReactNode; href?: string; onClick?: () => Promise<void> }>;
function nodes(node: ReactNode): Node[] {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!node || typeof node !== "object" || !("props" in node)) return [];
  const element = node as Node;
  return [element, ...nodes(element.props.children)];
}
function render(extra = {}) {
  hooks.cursor = 0;
  return nodes(QuickGenerate({ ...props, ...extra }));
}
function result() {
  render();
  // Completed generation, before the user chooses Send to review.
  hooks.values[5] = "complete";
  hooks.values[7] = { postText: "A useful post", postType: "insight" };
  return render();
}
async function send() {
  const button = render().find(n => n.type === "button" && nodes(n).length > 0 && JSON.stringify(n.props.children).includes("Send to review"));
  expect(button?.props.onClick).toBeDefined();
  await button!.props.onClick!();
}

beforeEach(() => {
  hooks.values = [];
  vi.unstubAllGlobals();
});

describe("Quick Post review handoff", () => {
  it.each([null, "2026-11-02"])("opens the returned saved item for date %s and preserves its plan", async (date) => {
    const extra = date ? { initialScheduledDate: date, initialScheduledTime: "10:30" } : {};
    result();
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: "saved-piece" }) });
    vi.stubGlobal("fetch", fetcher);
    hooks.cursor = 0;
    const tree = nodes(QuickGenerate({ ...props, ...extra }));
    const button = tree.find(n => n.type === "button" && JSON.stringify(n.props.children).includes("Send to review"));
    await button!.props.onClick!();
    const [, request] = fetcher.mock.calls[0];
    expect(JSON.parse(request.body)).toMatchObject({ companyId: "ours", unscheduled: !date, scheduledDate: date, scheduledTime: date ? "10:30" : null });
    const link = render(extra).find(n => n.type === "a" && n.props.children === "Open to approve");
    expect(link?.props.href).toBe("/content/saved-piece");
  });

  it("keeps the save action available after a failed save", async () => {
    result();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: "Save failed" }) }));
    await send();
    expect(render().some(n => n.props.children === "Open to approve")).toBe(false);
    expect(render().some(n => n.props.children === "Save failed")).toBe(true);
  });

  it("reuses an already saved queued item instead of creating a duplicate", async () => {
    result();
    // Seed the existing queued piece state, after the review/error slots.
    hooks.values[29] = "queued-piece";
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    vi.stubGlobal("fetch", fetcher);
    await send();
    expect(fetcher).toHaveBeenCalledWith("/api/calendar/reschedule", expect.objectContaining({ method: "PATCH" }));
    expect(render().find(n => n.props.children === "Open to approve")?.props.href).toBe("/content/queued-piece");
  });
});
