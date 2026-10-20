import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { fakeSupabase } from "@/test/fake-supabase";

const state = vi.hoisted(() => ({
  role: "admin",
  canPublish: false,
  type: "meme",
  approval: "approved",
  images: [] as Array<{ id: string; public_url: string; filename: string; sort_order: number }>,
  assets: [] as Array<{ id: string; asset_type: string; file_url: string; asset_metadata?: Record<string, unknown> }>,
}));

vi.mock("@/lib/supabase/server", () => ({
  getUserProfile: async () => ({ id: "user-a", role: state.role, company_id: "company-a", can_publish: state.canPublish }),
  createServerSupabaseClient: async () => fakeSupabase({
    content_pieces: { data: { id: "piece-a", company_id: "company-a", week_id: null, content_type: state.type, approval_status: state.approval, title: "A useful post", markdown_body: "Draft text", cover_image_url: null } },
    content_images: { data: state.images },
    content_assets: (calls) => {
      const videoOnly = calls.some((call) => call.method === "eq" && call.args[0] === "asset_metadata->>type");
      const pdfOnly = calls.some((call) => call.method === "eq" && call.args[0] === "asset_type");
      return { data: state.assets.filter((asset) => videoOnly ? asset.asset_metadata?.type === "rendered_video" : pdfOnly ? asset.asset_type === "pdf_file" : true) };
    },
    comments: { data: [] }, companies: { data: null },
  }).client,
}));

vi.mock("@/components/content/ContentViewTabs", () => ({ default: () => null }));
vi.mock("@/components/content/ApprovalButtons", () => ({ default: () => null }));
vi.mock("@/components/comments/CommentThread", () => ({ default: () => null }));
vi.mock("@/components/comments/CommentForm", () => ({ default: () => null }));
vi.mock("@/components/content/ContentAssets", () => ({ default: () => null }));
vi.mock("@/components/content/BankPicker", () => ({ default: () => null }));
vi.mock("@/components/content/PlatformVariants", () => ({ default: () => null }));
vi.mock("@/components/content/GenerateActions", () => ({ default: () => null }));
vi.mock("@/components/content/WebsitePublishPanel", () => ({ default: () => null }));
vi.mock("@/components/content/DeletePieceButton", () => ({ default: () => null }));

import ContentPiecePage from "./page";

const render = async () => renderToStaticMarkup(await ContentPiecePage({ params: Promise.resolve({ pieceId: "piece-a" }) }));
function withImages(count: number) {
  state.images = Array.from({ length: count }, (_, index) => ({ id: `image-${index}`, public_url: `https://example.test/${index}.jpg`, filename: `${index}.jpg`, sort_order: index }));
}

beforeEach(() => {
  state.role = "admin";
  state.canPublish = false;
  state.type = "meme";
  state.approval = "approved";
  state.images = [];
  state.assets = [];
});

describe("content detail's publishing route choice", () => {
  it.each([0, 1, 2])("retains the existing admin LinkedIn confirmation for an approved meme with %i images", async (count) => {
    withImages(count);
    const html = await render();
    expect(html).toContain("Publish to LinkedIn");
    expect(html).not.toContain("Choose destination and time");
  });

  it("retains the meme action when its single gallery image also has an image asset", async () => {
    withImages(1);
    state.assets = [{ id: "generated-image", asset_type: "featured_image", file_url: state.images[0].public_url }];
    const html = await render();
    expect(html).toContain("Publish to LinkedIn");
    expect(html).not.toContain("Choose destination and time");
  });

  it.each([0, 1])("uses only the shared Publish route for an ordinary social post with %i images", async (count) => {
    state.type = "social_post";
    withImages(count);
    const html = await render();
    expect(html).toContain('href="/publish?companyId=company-a&amp;pieceId=piece-a"');
    expect(html).not.toContain("Publish to LinkedIn");
  });

  it("preserves the existing multi-image social post route", async () => {
    state.type = "social_post";
    withImages(2);
    expect(await render()).toContain("Publish to LinkedIn");
  });

  it.each(["video", "document"])("keeps a meme carrying %s media out of the legacy path", async (shape) => {
    state.assets = shape === "video"
      ? [{ id: "video", asset_type: "video_file", file_url: "https://example.test/clip.mp4", asset_metadata: { type: "rendered_video" } }]
      : [{ id: "pdf", asset_type: "pdf_file", file_url: "https://example.test/guide.pdf" }];
    expect(await render()).not.toContain("Publish to LinkedIn");
  });

  it.each(["pending", "changes_requested"])("requires approval before exposing the restored meme action, including %s content", async (approval) => {
    state.approval = approval;
    withImages(1);
    expect(await render()).not.toContain("Publish to LinkedIn");
  });

  it.each([false, true])("keeps the legacy meme action admin-only when a client has can_publish=%s", async (canPublish) => {
    state.role = "client";
    state.canPublish = canPublish;
    withImages(1);
    expect(await render()).not.toContain("Publish to LinkedIn");
  });
});
