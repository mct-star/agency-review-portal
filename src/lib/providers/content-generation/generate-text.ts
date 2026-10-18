/** Shared text generation using the company's selected native API provider. */
import { requestText, resolveTextConfig, type TextOptions, type TextResult } from "../text-runtime";
export interface GenerateTextOptions extends TextOptions {
  companyId?: string;
  /** Retained for source compatibility. The selected API controls sampling. */
  temperature?: number;
  /** Legacy option, ignored. */
  geminiModel?: "gemini-2.5-pro" | "gemini-2.5-flash";
}
export type GenerateTextResult = TextResult;
export async function generateText(options: GenerateTextOptions): Promise<GenerateTextResult> {
  return requestText(await resolveTextConfig(options.companyId), options);
}
