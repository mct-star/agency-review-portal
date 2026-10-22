import { afterEach, describe, expect, it, vi } from "vitest";
import {
  directSocialJobId,
  directSocialNetwork,
  isDirectSocialPublicMediaUrl,
  validateDirectSocialOptions,
} from "./direct-social";

describe("direct social queue contract", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("keeps idempotency tied to one company, approved piece, platform and selected account", () => {
    const first = directSocialJobId("company-a", "piece-a", "account-a", "threads");
    expect(directSocialJobId("company-a", "piece-a", "account-a", "threads")).toBe(first);
    expect(directSocialJobId("company-b", "piece-a", "account-a", "threads")).not.toBe(first);
    expect(directSocialJobId("company-a", "piece-a", "account-b", "threads")).not.toBe(first);
    expect(directSocialJobId("company-a", "piece-a", "account-a", "bluesky")).not.toBe(first);
  });

  it("maps X to the operator network key and checks bounded provider options", () => {
    expect(directSocialNetwork("twitter")).toBe("x");
    expect(validateDirectSocialOptions("pinterest", { boardId: "board-1", link: "https://example.test/post" }))
      .toEqual({ boardId: "board-1", link: "https://example.test/post" });
    expect(validateDirectSocialOptions("pinterest", { boardId: "board-1", link: "javascript:alert(1)" })).toBeNull();
    expect(validateDirectSocialOptions("youtube", { privacy: "unlisted", madeForKids: false }))
      .toEqual({ privacy: "unlisted", madeForKids: false });
    expect(validateDirectSocialOptions("youtube", { privacyStatus: "unlisted", madeForKids: false })).toBeNull();
    expect(validateDirectSocialOptions("threads", { boardId: "board-1" })).toBeNull();
  });

  it("accepts only unsigned public media objects from the configured portal storage host", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://portal-test.supabase.co");
    expect(isDirectSocialPublicMediaUrl("https://portal-test.supabase.co/storage/v1/object/public/media/video.mp4")).toBe(true);
    expect(isDirectSocialPublicMediaUrl("https://portal-test.supabase.co/storage/v1/object/sign/media/video.mp4?token=secret")).toBe(false);
    expect(isDirectSocialPublicMediaUrl("https://other.example/video.mp4")).toBe(false);
  });
});
