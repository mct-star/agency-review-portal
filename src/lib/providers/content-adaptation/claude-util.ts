/** Compatibility helpers for text adapters. All native calls share text-runtime policy. */
import { requestText, resolveTextConfig, sharedTextConfig, TEXT_MODELS, textProvider, NO_PROVIDER, type TextOptions, type TextResult, type TextConfig } from "../text-runtime";
export const CLAUDE_SONNET = TEXT_MODELS.claude.writing;
export const CLAUDE_HAIKU = TEXT_MODELS.claude.utility;
export const GEMINI_FLASH = "gemini-2.5-flash";
const RETIRED: Record<string, string> = {
  "claude-sonnet-4-20250514": CLAUDE_SONNET,
  "claude-opus-4-20250514": CLAUDE_SONNET,
  "claude-3-5-haiku-20241022": CLAUDE_HAIKU,
  "claude-haiku-4-20250514": CLAUDE_HAIKU,
  "claude-3-5-sonnet-20241022": CLAUDE_SONNET,
  "claude-3-7-sonnet-20250219": CLAUDE_SONNET,
};

/**
 * The model to send for a requested id. A stored setting may still name a
 * retired id (the seed script wrote one into company_api_configs), so anything
 * unknown is mapped to the current Sonnet, and anything in the haiku family
 * to the current Haiku.
 */
export function currentClaudeModel(requested?: string | null): string {
  if (!requested) return CLAUDE_SONNET;
  if (requested === CLAUDE_SONNET || requested === CLAUDE_HAIKU || requested === "claude-opus-5-5") return requested;
  if (RETIRED[requested]) return RETIRED[requested];
  return /haiku/i.test(requested) ? CLAUDE_HAIKU : CLAUDE_SONNET;
}

export type TextCallResult = TextResult;
export type ClaudeEffort = "low" | "medium" | "high";
export const NO_ANTHROPIC_KEY = "no-anthropic-key-will-fallback-to-gemini";
export function geminiKey(): string { return process.env.GOOGLE_GEMINI_API_KEY || ""; }
export type ImageMediaType = "image/jpeg" | "image/png" | "image/webp" | "image/gif";
export async function callText(apiKey: string, model: string, system: string, userMessage: string, maxTokens = 4096, opts: Partial<TextOptions> & { companyId?: string; config?: TextConfig } = {}): Promise<TextCallResult> {
  // A supplied key is client-owned. Never attach a shared or another company's fallback.
  const config = opts.companyId ? await resolveTextConfig(opts.companyId) : opts.config ?? (apiKey && apiKey !== NO_ANTHROPIC_KEY
    ? { apiKey, provider: model.startsWith("gpt-") ? "openai" as const : "claude" as const }
    : sharedTextConfig());
  return requestText(config, { ...opts, systemPrompt: system, userPrompt: userMessage, maxTokens });
}
export async function callTextWithImage(apiKey: string, model: string, system: string, userText: string, imageBase64: string, mediaType: ImageMediaType, maxTokens = 2000, opts: { companyId?: string } = {}): Promise<TextCallResult> {
  return callText(apiKey, model, system, userText, maxTokens, { ...opts, images: [{ base64: imageBase64, mimeType: mediaType }] });
}
export async function callClaude(apiKey: string, model: string, system: string, userMessage: string, maxTokens = 4096, opts: Partial<TextOptions> & { companyId?: string; config?: TextConfig } = {}): Promise<string> {
  return (await callText(apiKey, model, system, userMessage, maxTokens, opts)).text;
}
export function parseClaudeJson<T>(text: string): T {
  try { return JSON.parse(text.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "").trim()) as T; }
  catch { throw new Error("The writing assistant returned an unreadable response. Please try again."); }
}
export function resolveClaudeConfig(credentials: Record<string, unknown>, settings: Record<string, unknown>): { apiKey: string; model: string } {
  const provider = settings.provider ? textProvider(settings.provider) : String(settings.model || "").startsWith("gpt-") ? "openai" : "claude";
  const apiKey = typeof credentials.api_key === "string" ? credentials.api_key : "";
  if (!apiKey) throw new Error(NO_PROVIDER);
  return { apiKey, model: TEXT_MODELS[provider].writing };
}
