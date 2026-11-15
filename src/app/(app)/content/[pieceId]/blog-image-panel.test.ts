import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { fakeSupabase } from "@/test/fake-supabase";
import { blogImagesWorld, type WorldImage } from "@/test/blog-images-world";

const A = "11111111-1111-4111-8111-111111111111";

const state = vi.hoisted(() => ({
  role: "client",
  type: "blog_article",
  body: "Opening words.\n\n[[image: 1]]\n\nMore words.",
  images: [] as Array<Record<string, unknown>>,
  gateSettings: {} as Record<string, unknown>,
  adminClients: 0,
}));

vi.mock("@/lib/supabase/server", () => ({
  getUserProfile: async () => ({ id: "user-a", role: state.role, company_id: "11111111-1111-4111-8111-111111111111", can_publish: false }),
  createServerSupabaseClient: async () => fakeSupabase({
    content_pieces: { data: { id: "piece-a", company_id: "11111111-1111-4111-8111-111111111111", week_id: null, content_type: state.type, approval_status: "pending", title: "Example blog", markdown_body: state.body } },
    content_images: { data: state.images }, content_assets: { data: [] }, comments: { data: [] }, companies: { data: null },
  }).client,
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminSupabaseClient: async () => {
    state.adminClients++;
    return blogImagesWorld({ images: state.images as unknown as WorldImage[], gateSettings: state.gateSettings }).client;
  },
}));
vi.mock("@/lib/publishing/blog-target", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  resolveBlogTarget: async () => ({ refusal: "none" }),
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
vi.mock("@/components/content/ReviewNotes", () => ({ default: () => null }));

import ContentPiecePage from "./page";

const render = async () => renderToStaticMarkup(await ContentPiecePage({ params: Promise.resolve({ pieceId: "piece-a" }) }));
const row = (id: string, archetype: string, extra: Record<string, unknown> = {}) =>
  ({ id, content_piece_id: "piece-a", archetype, public_url: `https://example.com/${id}.png`, filename: `${id}.png`, sort_order: 0, ...extra });

beforeEach(() => {
  state.role = "client";
  state.type = "blog_article";
  state.body = "Opening words.\n\n[[image: 1]]\n\nMore words.";
  state.images = [];
  state.gateSettings = {};
  state.adminClients = 0;
});

describe("the blog image panel on the piece page", () => {
  it("shows a company's own client user the records, the share upload and the verdict", async () => {
    state.images = [
      row("hero", "hero_image_prompt", { image_record: { type: "photograph", passage: "The opening" } }),
      row("in1", "in_article_image_prompt_1"),
    ];
    const html = await render();
    expect(html).toContain("Blog images");
    expect(html).toContain("The hero image");
    expect(html).toContain("Inline image 1");
    expect(html).toContain('value="The opening"');
    expect(html).toContain("(required)");
    expect(html).toContain("The portal does not make the share card yet, so upload it here for now: a designed image 1200 by 630, not the hero.");
    expect(html).toContain("Upload the share image");
    expect(html).toContain("(PNG, JPEG or WebP, up to 4 MB)");
    expect(html).toContain("Image checks");
    expect(html).toContain("Every image has a record");
    expect(html).toContain("Failed");
    expect(html).toContain("inline image 1 has no image record");
    expect(html).toContain("Not required");
    expect(html).toContain("These checks are shown here but do not yet block publishing for this company.");
  });

  it("drops the not-yet-blocking line when the company enforces the checks", async () => {
    state.gateSettings = { [A]: { enforceImageChecks: true } };
    const html = await render();
    expect(html).toContain("Image checks");
    expect(html).not.toContain("do not yet block publishing");
  });

  it("explains an inline image with no slot and an older cover picture", async () => {
    state.body = "No slots here.";
    state.images = [row("in2", "in_article_image_prompt_2"), row("cover", "cover_image_prompt")];
    const html = await render();
    expect(html).toContain("Inline image 2 has no [[image: 2]] line in the text, so it will not be published and is not checked.");
    expect(html).toContain("The older share picture made from the cover prompt is not checked as the share image.");
  });

  it("shows the measured size of an uploaded share image", async () => {
    state.images = [row("share", "share_card", { dimensions: "1000x500", image_record: { role: "share", passage: "Card" } })];
    const html = await render();
    expect(html).toContain("Uploaded, measured at 1000 by 500.");
    expect(html).toContain("Replace the share image");
    expect(html).toContain("the share image is 1000 by 500");
  });

  it("is shown to an admin too", async () => {
    state.role = "admin";
    expect(await render()).toContain("Blog images");
  });

  it("is not shown on a piece that is not a blog, and reads nothing for it", async () => {
    state.type = "social_post";
    const html = await render();
    expect(html).not.toContain("Blog images");
    expect(state.adminClients).toBe(0);
  });
});
