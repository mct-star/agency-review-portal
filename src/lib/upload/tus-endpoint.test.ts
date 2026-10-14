import { describe, expect, it } from "vitest";
import { tusEndpointFor, TUS_CHUNK_BYTES } from "./tus-endpoint";

describe("tusEndpointFor", () => {
  it("uses the direct storage host for a hosted project", () => {
    expect(tusEndpointFor("https://abcdefghijklmnopqrst.supabase.co")).toBe(
      "https://abcdefghijklmnopqrst.storage.supabase.co/storage/v1/upload/resumable/sign"
    );
  });
  it("falls back to the API host for anything else", () => {
    expect(tusEndpointFor("http://localhost:54321/")).toBe("http://localhost:54321/storage/v1/upload/resumable/sign");
  });
  it("keeps the chunk size Supabase requires", () => {
    expect(TUS_CHUNK_BYTES).toBe(6291456);
  });
});
