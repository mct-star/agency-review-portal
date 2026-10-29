import { describe, expect, it } from "vitest";
import { destinationIssue, publishingEndpoint, publishingStatus, readPublishingDraft, publishingDraftKey, scheduleIssue, type PublishingDestination, type PublishingPiece } from "./workspace";

const piece: PublishingPiece = { id: "p1", title: "Approved", content_type: "social_post", week_id: null, preview: { linkedin: "Post", meta: "Post #tag", social: "Post #tag", firstComment: null }, media: { shape: "none", items: [] } };
const account: PublishingDestination = { id: "a1", platform: "linkedin_personal", accountName: "Example", usable: true, configured: true, enabled: true };

describe("publishing readiness", () => {
  it("keeps reconnect, configuration and enablement failures distinct", () => {
    expect(destinationIssue(piece, { ...account, usable: false })).toContain("Reconnect");
    expect(destinationIssue(piece, { ...account, configured: false })).toContain("setup");
    expect(destinationIssue(piece, { ...account, enabled: false })).toContain("enable");
    expect(destinationIssue(piece, account)).toBeNull();
  });
  it("checks each destination's approved content and media requirements before submission", () => {
    expect(destinationIssue(piece, { ...account, platform: "instagram" })).toContain("one image");
    expect(destinationIssue(piece, { ...account, platform: "pinterest" })).toContain("one image");
    expect(destinationIssue({ ...piece, media: { shape: "images", items: [] } }, account)).toContain("one image");
    expect(destinationIssue(piece, { ...account, platform: "youtube" })).toContain("rendered video");
    expect(destinationIssue({ ...piece, content_type: "video_script", media: { shape: "video", items: [{ kind: "video", url: "video.mp4", alt: "" }] } }, { ...account, platform: "youtube" })).toBeNull();
    expect(destinationIssue({ ...piece, content_type: "blog_article" }, account)).toContain("social post");
  });
  it("lets LinkedIn take one approved video on a social post or video piece", () => {
    const media = { shape: "video" as const, items: [{ kind: "video" as const, url: "video.mp4", alt: "" }] };
    expect(destinationIssue({ ...piece, media }, account)).toBeNull();
    expect(destinationIssue({ ...piece, content_type: "video", media }, account)).toBeNull();
    expect(destinationIssue({ ...piece, content_type: "video_script", media }, account)).toContain("one approved video");
    expect(destinationIssue({ ...piece, media: { ...media, items: [] } }, account)).toContain("one approved video");
    expect(destinationIssue({ ...piece, media }, { ...account, platform: "bluesky" })).toContain("text or one image");
  });
  it("does not mislabel an active connection merely because nothing is selected", () => {
    expect(destinationIssue(undefined, account)).toBeNull();
  });
  it("checks YouTube's known title and description requirements before queueing", () => {
    const video: PublishingPiece = { ...piece, content_type: "video_script", media: { shape: "video", items: [{ kind: "video", url: "video.mp4", alt: "" }] } };
    const channel: PublishingDestination = { ...account, platform: "youtube" };
    expect(destinationIssue({ ...video, title: "x".repeat(101) }, channel)).toContain("100");
    expect(destinationIssue({ ...video, title: " " }, channel)).toContain("100");
    expect(destinationIssue({ ...video, preview: { ...video.preview, social: "x".repeat(5001) } }, channel)).toContain("5,000");
    expect(destinationIssue({ ...video, preview: { ...video.preview, social: " " } }, channel)).toContain("description");
  });
  it("rejects invalid and elapsed schedules without rejecting queue-now", () => {
    expect(scheduleIssue("")).toBeNull();
    expect(scheduleIssue("invalid")).toContain("future");
    expect(scheduleIssue("2026-10-20T10:00", new Date("2026-10-20T10:01").getTime())).toContain("future");
    expect(scheduleIssue("2026-10-20T11:00", new Date("2026-10-20T10:01").getTime())).toBeNull();
  });
  it("uses existing provider routes and names uncertain outcomes explicitly", () => {
    expect(publishingEndpoint("linkedin_personal")).toBe("/api/publish/linkedin-direct");
    expect(publishingEndpoint("instagram")).toBe("/api/publish/meta");
    expect(publishingEndpoint("youtube")).toBe("/api/publish/social");
    expect(publishingStatus({ status: "failed", needs_checking: true })).toBe("Needs checking");
    expect(publishingStatus({ status: "failed", response_payload: { outcome_uncertain: true } })).toBe("Needs checking");
    expect(publishingStatus({ status: "queued" })).toBe("Queued");
  });
});

describe("resuming a publishing selection", () => {
  it("restores only whitelisted selection fields within the same user and company", () => {
    const data = new Map([[publishingDraftKey("user-a", "company-a"), JSON.stringify({ pieceId: "p1", accountId: "a1", scheduledFor: "2026-11-01T12:00", privacy: "private", markdown_body: "Do not store this" })]]);
    const storage = { getItem: (key: string) => data.get(key) || null };
    expect(readPublishingDraft(storage, "user-a", "company-a")).toMatchObject({ pieceId: "p1", accountId: "a1", scheduledFor: "2026-11-01T12:00" });
    expect(readPublishingDraft(storage, "user-b", "company-a").pieceId).toBe("");
    expect(readPublishingDraft(storage, "user-a", "company-b").pieceId).toBe("");
    expect(readPublishingDraft(storage, "user-a", "company-a")).not.toHaveProperty("markdown_body");
  });
  it("survives blocked storage, malformed data and obsolete option values", () => {
    expect(readPublishingDraft({ getItem: () => { throw new Error("Blocked"); } }, "u", "c").pieceId).toBe("");
    expect(readPublishingDraft({ getItem: () => "invalid json" }, "u", "c").pieceId).toBe("");
    expect(readPublishingDraft({ getItem: () => JSON.stringify({ privacy: "invalid", madeForKids: 1, pieceId: 17 }) }, "u", "c")).toMatchObject({ privacy: "private", madeForKids: "", pieceId: "" });
  });
});
