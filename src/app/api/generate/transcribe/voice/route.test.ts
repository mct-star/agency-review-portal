import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  profile: { id: "u-a", role: "client", company_id: "company-a" } as { id: string; role: string; company_id: string | null } | null,
  transcribe: vi.fn(),
}));
vi.mock("@/lib/supabase/admin", () => ({ getSignedInProfile: async () => state.profile }));
vi.mock("@/lib/providers/transcription/transcribe", () => ({ transcribeAudio: state.transcribe }));
import { POST } from "./route";

function recording(companyId?: string, type = "audio/webm;codecs=opus", size = 10) {
  const body = new FormData();
  body.append("audio", new Blob([new Uint8Array(size)], { type }), "recording.webm");
  return new Request(`https://platform.test/api/generate/transcribe/voice${companyId ? `?companyId=${companyId}` : ""}`, { method: "POST", body });
}

beforeEach(() => {
  state.profile = { id: "u-a", role: "client", company_id: "company-a" };
  state.transcribe.mockReset().mockResolvedValue({ text: "An answer", provider: "gemini" });
});

describe("voice transcription", () => {
  it("requires sign-in and refuses another company's transcription context", async () => {
    state.profile = null;
    expect((await POST(recording("company-a"))).status).toBe(401);
    state.profile = { id: "u-a", role: "client", company_id: "company-a" };
    expect((await POST(recording("company-b"))).status).toBe(403);
    expect(state.transcribe).not.toHaveBeenCalled();
  });

  it("uses the admin's selected company, including MP4 audio", async () => {
    state.profile = { id: "admin", role: "admin", company_id: null };
    const response = await POST(recording("company-b", "audio/mp4"));
    expect(response.status).toBe(200);
    expect(state.transcribe).toHaveBeenCalledWith(expect.any(Buffer), "audio/mp4", "company-b");
    expect(await response.json()).toEqual({ text: "An answer", provider: "gemini", duration: 0 });
  });

  it("uses the member's own company when the caller omits companyId", async () => {
    expect((await POST(recording())).status).toBe(200);
    expect(state.transcribe).toHaveBeenCalledWith(expect.any(Buffer), "audio/webm", "company-a");
  });

  it("rejects empty, missing, unsupported and oversized audio before a provider call", async () => {
    expect((await POST(recording(undefined, "audio/webm", 0))).status).toBe(400);
    expect((await POST(new Request("https://platform.test/api", { method: "POST", body: new FormData() }))).status).toBe(400);
    expect((await POST(recording(undefined, "image/png"))).status).toBe(415);
    expect((await POST(recording(undefined, "audio/webm", 4 * 1024 * 1024 + 1))).status).toBe(413);
    expect(state.transcribe).not.toHaveBeenCalled();
  });

  it("bounds a chunked request even when Content-Length is missing", async () => {
    const response = await POST(new Request("https://platform.test/api", {
      method: "POST",
      body: new Uint8Array(5 * 1024 * 1024),
      headers: { "content-type": "multipart/form-data; boundary=test" },
    }));
    expect(response.status).toBe(413);
    expect(state.transcribe).not.toHaveBeenCalled();
  });

  it("bounds a stalled upload and returns a typing fallback", async () => {
    vi.useFakeTimers();
    try {
      const body = new ReadableStream<Uint8Array>({ start() {} });
      const request = new Request("https://platform.test/api", {
        method: "POST", body, duplex: "half",
        headers: { "content-type": "multipart/form-data; boundary=test" },
      } as RequestInit);
      const pending = POST(request);
      await vi.advanceTimersByTimeAsync(15_001);
      const response = await pending;
      expect(response.status).toBe(408);
      expect((await response.json()).error).toContain("type instead");
      expect(state.transcribe).not.toHaveBeenCalled();
    } finally { vi.useRealTimers(); }
  });

  it("offers typing when providers fail without disclosing the provider error", async () => {
    state.transcribe.mockRejectedValue(new Error("private vendor error"));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const response = await POST(recording());
      expect(response.status).toBe(502);
      const data = await response.json();
      expect(data.error).toContain("type instead");
      expect(data.error).not.toContain("private vendor");
    } finally { log.mockRestore(); }
  });
});
