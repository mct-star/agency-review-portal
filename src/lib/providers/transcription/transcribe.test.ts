import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { transcribeAudio } from "./transcribe";

const fetchMock = vi.fn();
beforeEach(() => {
  vi.stubEnv("GOOGLE_GEMINI_API_KEY", "test-gemini-key");
  vi.stubEnv("OPENAI_API_KEY", "test-openai-key");
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("API transcription providers", () => {
  it("sends actual audio format to Gemini with a bounded API request", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: " Spoken answer " }] } }] })));
    expect(await transcribeAudio(Buffer.from("audio"), "audio/mp4")).toEqual({ text: "Spoken answer", provider: "gemini" });
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toContain("generativelanguage.googleapis.com");
    expect(JSON.parse(options.body).contents[0].parts[1].inline_data.mime_type).toBe("audio/mp4");
    expect(options.signal).toBeInstanceOf(AbortSignal);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("falls back to Whisper preserving MP4 MIME type and file extension", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      fetchMock.mockResolvedValueOnce(new Response("unavailable", { status: 429 }))
        .mockResolvedValueOnce(new Response(JSON.stringify({ text: " Fallback answer ", duration: 6 })));
      expect(await transcribeAudio(Buffer.from("audio"), "audio/mp4")).toEqual({ text: "Fallback answer", provider: "openai", duration: 6 });
      const [url, options] = fetchMock.mock.calls[1];
      expect(url).toBe("https://api.openai.com/v1/audio/transcriptions");
      expect(options.headers.Authorization).toBe("Bearer test-openai-key");
      const file = options.body.get("file") as File;
      expect(file.type).toBe("audio/mp4");
      expect(file.name).toBe("audio.mp4");
      expect(options.signal).toBeInstanceOf(AbortSignal);
    } finally { log.mockRestore(); }
  });

  it("uses Whisper directly when only its API is configured", async () => {
    vi.stubEnv("GOOGLE_GEMINI_API_KEY", "");
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ text: "Answer", duration: 3 })));
    expect((await transcribeAudio(Buffer.from("audio"), "audio/webm;codecs=opus")).provider).toBe("openai");
    const file = fetchMock.mock.calls[0][1].body.get("file") as File;
    expect(file.name).toBe("audio.webm");
    expect(file.type).toBe("audio/webm;codecs=opus");
  });

  it("fails clearly when no transcription API is configured", async () => {
    vi.stubEnv("GOOGLE_GEMINI_API_KEY", "");
    vi.stubEnv("OPENAI_API_KEY", "");
    await expect(transcribeAudio(Buffer.from("audio"))).rejects.toThrow("No transcription provider available");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
