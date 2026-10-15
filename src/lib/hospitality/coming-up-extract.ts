import { generateText } from "@/lib/providers/content-generation/generate-text";
import { callTextWithImage, CLAUDE_SONNET, NO_ANTHROPIC_KEY, type ImageMediaType } from "@/lib/providers/content-adaptation/claude-util";
import { buildExtractPrompt, parseIcs, parseUpcomingJson, validateUpcoming, type ParsedUpcoming } from "./coming-up";

/**
 * What an upload has coming up: an .ics calendar is read here, a PDF's text
 * and a photo are read by the model with the same rules as the dictation.
 * Nothing is saved: the person ticks what to add on a review list.
 */

export const MAX_UPLOAD_BYTES = 4_000_000;
const IMAGE_TYPES: ImageMediaType[] = ["image/jpeg", "image/png", "image/webp", "image/gif"];

export type UploadKind = "ics" | "pdf" | "image";

/** Which reader a file needs, or a plain reason it cannot be read. */
export function uploadKind(name: string, type: string): { ok: true; kind: UploadKind } | { ok: false; error: string } {
  const lower = name.toLowerCase();
  if (lower.endsWith(".ics") || type === "text/calendar") return { ok: true, kind: "ics" };
  if (lower.endsWith(".pdf") || type === "application/pdf") return { ok: true, kind: "pdf" };
  if (type.startsWith("image/")) {
    if ((IMAGE_TYPES as string[]).includes(type)) return { ok: true, kind: "image" };
    return { ok: false, error: "We cannot read that kind of photo. Save it as a JPEG or take a screenshot of it, then try again." };
  }
  return { ok: false, error: "Upload a PDF, a photo, or a calendar file (.ics)." };
}

export interface ExtractDeps {
  pdfText: (bytes: Buffer) => Promise<string>;
  readText: (system: string, user: string) => Promise<string>;
  readImage: (system: string, user: string, base64: string, mediaType: ImageMediaType) => Promise<string>;
}

export async function extractUpcoming(
  file: { name: string; type: string; bytes: Buffer },
  ctx: { venueName: string; today: string; timeZone: string },
  deps: ExtractDeps = realExtractDeps
): Promise<ParsedUpcoming> {
  const k = uploadKind(file.name, file.type);
  if (!k.ok) throw new UploadError(k.error);

  if (k.kind === "ics") {
    return validateUpcoming(parseIcs(file.bytes.toString("utf8"), ctx.timeZone), ctx.today);
  }

  if (k.kind === "pdf") {
    let text = "";
    try {
      text = (await deps.pdfText(file.bytes)).trim();
    } catch (err) {
      console.error("[coming-up] pdf text failed:", err instanceof Error ? err.message : err);
      throw new UploadError("We could not read that PDF. If it is a scan, take a photo of it instead.");
    }
    if (text.length < 10) throw new UploadError("That PDF has no text we can read. If it is a scan, take a photo of it instead.");
    const { system, user } = buildExtractPrompt({ venueName: ctx.venueName, today: ctx.today, source: "pdf" });
    const prompt = `${user}\n\n${text.slice(0, 20_000)}`;
    return readWithRetry((u) => deps.readText(system, u), prompt, ctx.today);
  }

  const { system, user } = buildExtractPrompt({ venueName: ctx.venueName, today: ctx.today, source: "image" });
  const base64 = file.bytes.toString("base64");
  return readWithRetry((u) => deps.readImage(system, u, base64, file.type as ImageMediaType), user, ctx.today);
}

async function readWithRetry(read: (user: string) => Promise<string>, user: string, today: string): Promise<ParsedUpcoming> {
  try {
    return parseUpcomingJson(await read(user), today);
  } catch {
    return parseUpcomingJson(await read(`${user}\n\nReply with the JSON object only, in exactly the shape described.`), today);
  }
}

/** A reason the person can act on. Anything else is a server fault. */
export class UploadError extends Error {}

export const realExtractDeps: ExtractDeps = {
  pdfText: async (bytes) => {
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: new Uint8Array(bytes) });
    try {
      return (await parser.getText()).text || "";
    } finally {
      await parser.destroy().catch(() => undefined);
    }
  },
  readText: async (system, user) =>
    (await generateText({ systemPrompt: system, userPrompt: user, maxTokens: 2000, temperature: 0.2, geminiModel: "gemini-2.5-flash" })).text,
  readImage: async (system, user, base64, mediaType) =>
    (await callTextWithImage(process.env.ANTHROPIC_API_KEY || NO_ANTHROPIC_KEY, CLAUDE_SONNET, system, user, base64, mediaType, 2000)).text,
};
