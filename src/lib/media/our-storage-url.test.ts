import { describe, expect, it } from "vitest";
import { isOurStorageUrl } from "./our-storage-url";

const base = "https://abc.supabase.co";

describe("isOurStorageUrl", () => {
  it("accepts a public or signed object on our project", () => {
    expect(isOurStorageUrl(`${base}/storage/v1/object/public/media/x.png`, base)).toBe(true);
    expect(isOurStorageUrl(`${base}/storage/v1/object/sign/captures/y.jpg?token=t`, base)).toBe(true);
  });
  it("refuses other hosts, other paths, http and junk", () => {
    expect(isOurStorageUrl("https://evil.example/storage/v1/object/public/x.png", base)).toBe(false);
    expect(isOurStorageUrl(`${base}/rest/v1/users`, base)).toBe(false);
    expect(isOurStorageUrl(`http://abc.supabase.co/storage/v1/object/public/x.png`, base)).toBe(false);
    expect(isOurStorageUrl("not a url", base)).toBe(false);
    expect(isOurStorageUrl(undefined, base)).toBe(false);
    expect(isOurStorageUrl(`${base}/storage/v1/object/public/x.png`, undefined)).toBe(false);
  });
});
