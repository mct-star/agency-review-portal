import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  pieces: [] as Array<Record<string, unknown>>,
  assets: [] as Array<Record<string, unknown>>,
  jobs: [] as Array<Record<string, unknown>>,
  approvals: [] as Array<Record<string, unknown>>,
  networks: null as string[] | null,
}));

vi.mock("@/lib/auth/permissions", () => ({ canAccessCompany: () => true }));
vi.mock("@/lib/supabase/admin", () => ({
  getSignedInProfile: async () => ({ id: "user-1", role: "admin" }),
  createAdminSupabaseClient: async () => ({
    from(table: string) {
      const raw =
        table === "weeks" ? { company_id: "co-1", date_start: "2026-10-12", week_number: 42, company: { slug: "client", social_networks: state.networks } }
        : table === "content_pieces" ? state.pieces
        : table === "content_assets" ? state.assets
        : table === "publishing_jobs" ? state.jobs
        : table === "content_approvals" ? state.approvals
        : [];
      // The queue and the approval record are filtered as asked, so the
      // tests prove the export reads only this company's rows.
      const filtered = table === "publishing_jobs" || table === "content_approvals";
      const filters: Array<(row: Record<string, unknown>) => boolean> = [];
      const chain: Record<string, unknown> = {};
      for (const method of ["select", "not", "order"]) chain[method] = () => chain;
      chain.eq = (key: string, value: unknown) => { if (filtered) filters.push((r) => r[key] === value); return chain; };
      chain.in = (key: string, values: unknown[]) => { if (filtered) filters.push((r) => values.includes(r[key])); return chain; };
      const data = () => Array.isArray(raw) ? raw.filter((r) => filters.every((f) => f(r))) : raw;
      chain.single = async () => ({ data: data(), error: null });
      chain.then = (resolve: (value: { data: unknown; error: null }) => void) => resolve({ data: data(), error: null });
      return chain;
    },
  }),
}));

import { GET } from "./route";
import { pieceVersionHash } from "@/lib/content/version-hash";

const post = (id: string, title: string) => ({ id, title, markdown_body: `${title} body`, first_comment: null, post_type: "video_clip", scheduled_date: "2026-10-14", scheduled_time: "12:00" });
const clip = (pieceId: string, thumbnailUrl?: string) => ({
  content_piece_id: pieceId,
  asset_type: "custom",
  file_url: `https://cdn.example.com/${pieceId}.mp4`,
  text_content: "Clip",
  asset_metadata: { type: "rendered_video", ...(thumbnailUrl ? { thumbnailUrl } : {}) },
});
const exportWeek = () => GET(new Request("https://portal.test/api/export/metricool?weekId=week-1"));
const exportLeftForScheduler = () => GET(new Request("https://portal.test/api/export/metricool?weekId=week-1&leftForScheduler=true"));
const feedPost = (id: string, title: string) => ({ ...post(id, title), company_id: "co-1", content_type: "social_post", approval_status: "approved", post_type: "insight" });
const approve = (p: Record<string, unknown>, companyId = "co-1") => ({ piece_id: p.id, company_id: companyId, decision: "approved", decided_at: "2026-11-10T09:00:00.000Z", version_hash: pieceVersionHash(p) });
const job = (pieceId: string, status: string, companyId = "co-1") => ({ content_piece_id: pieceId, company_id: companyId, target_platform: "linkedin_personal", status });
const rows = (csv: string) => csv.replace(/^\uFEFF/, "").trim().split("\r\n");

describe("GET /api/export/metricool", () => {
  beforeEach(() => {
    state.pieces = [];
    state.assets = [];
    state.jobs = [];
    state.approvals = [];
    state.networks = null;
  });

  it("leaves a LinkedIn video with no thumbnail out of the file and names it in the notes", async () => {
    state.pieces = [post("kept", "Kept clip"), post("held", "Held clip"), post("words", "Words only")];
    state.assets = [clip("kept", "https://cdn.example.com/kept.jpg"), clip("held")];

    const res = await exportWeek();
    const csv = await res.text();

    expect(res.status).toBe(200);
    expect(csv).toContain("Kept clip body");
    expect(csv).toContain("https://cdn.example.com/kept.jpg");
    expect(csv).toContain("Words only body");
    expect(csv).not.toContain("Held clip body");
    expect(csv.trim().split("\r\n")).toHaveLength(3);
    expect(decodeURIComponent(res.headers.get("X-Export-Notes") || "")).toMatch(/Held clip is a LinkedIn video with no thumbnail/);
  });

  it("answers with the reason, not a file of headers, when every post is held back", async () => {
    state.pieces = [post("held", "Held clip")];
    state.assets = [clip("held")];

    const res = await exportWeek();

    expect(res.status).toBe(422);
    expect((await res.json()).error).toMatch(/Held clip is a LinkedIn video with no thumbnail/);
  });

  it("by default still includes a post with a direct LinkedIn job, and needs no approval record (unchanged for the Mac pipeline)", async () => {
    const queued = feedPost("queued", "Queued post");
    state.pieces = [queued, feedPost("free", "Free post")];
    state.jobs = [job("queued", "scheduled")];

    const csv = await (await exportWeek()).text();

    expect(csv).toContain("Queued post body");
    expect(csv).toContain("Free post body");
    expect(rows(csv)).toHaveLength(3);
  });

  it("with leftForScheduler, leaves out every post already in the direct LinkedIn queue or published, and keeps the rest", async () => {
    const posts = [feedPost("scheduled", "Scheduled post"), feedPost("published", "Published post"), feedPost("unsure", "Unsure post"), feedPost("failed", "Failed post"), feedPost("free", "Free post")];
    state.pieces = posts;
    state.approvals = posts.map((p) => approve(p));
    state.jobs = [
      job("scheduled", "scheduled"), job("published", "published"),
      { ...job("unsure", "failed"), response_payload: { outcome_uncertain: true } },
      { ...job("failed", "failed"), response_payload: { outcome_uncertain: false } },
    ];

    const res = await exportLeftForScheduler();
    const csv = await res.text();

    expect(res.status).toBe(200);
    expect(csv).not.toContain("Scheduled post body");
    expect(csv).not.toContain("Published post body");
    expect(csv).not.toContain("Unsure post body");
    expect(csv).toContain("Failed post body");
    expect(csv).toContain("Free post body");
    expect(decodeURIComponent(res.headers.get("X-Export-Notes") || "")).toMatch(/Scheduled post is already in the LinkedIn queue/);
  });

  it("with leftForScheduler, ignores another company's LinkedIn job and approval for the same piece", async () => {
    const free = feedPost("free", "Free post");
    state.pieces = [free];
    state.approvals = [approve(free), { ...approve(free, "co-2"), version_hash: "0".repeat(64), decided_at: "2026-11-12T09:00:00.000Z" }];
    state.jobs = [job("free", "scheduled", "co-2")];

    expect(await (await exportLeftForScheduler()).text()).toContain("Free post body");
  });

  it("with leftForScheduler, keeps a queued post's other networks and turns LinkedIn off for it", async () => {
    state.networks = ["linkedin", "x"];
    const queued = feedPost("queued", "Queued post");
    state.pieces = [queued];
    state.approvals = [approve(queued)];
    state.jobs = [job("queued", "scheduled")];

    const [, row] = rows(await (await exportLeftForScheduler()).text());

    expect(row).toContain("Queued post body");
    const cells = row.split('","');
    expect(cells[5]).toBe("true"); // Twitter/X
    expect(cells[6]).toBe("false"); // LinkedIn
  });

  it("with leftForScheduler, leaves out a post edited after approval or with no recorded approval", async () => {
    const edited = feedPost("edited", "Edited post");
    const unrecorded = feedPost("unrecorded", "Unrecorded post");
    const ok = feedPost("ok", "Approved post");
    state.approvals = [approve(edited), approve(ok)];
    state.pieces = [{ ...edited, markdown_body: "Changed after approval" }, unrecorded, ok];

    const res = await exportLeftForScheduler();
    const csv = await res.text();

    expect(csv).not.toContain("Changed after approval");
    expect(csv).not.toContain("Unrecorded post body");
    expect(csv).toContain("Approved post body");
    expect(decodeURIComponent(res.headers.get("X-Export-Notes") || "")).toMatch(/Edited post was left out of this file. It was edited after approval/);
  });
});
