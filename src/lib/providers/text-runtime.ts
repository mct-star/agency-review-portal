/** Native text transport and company credential policy, shared by writers and adapters. */
import { resolveProvider } from "./index";
export const TEXT_MODELS = {
  claude: { writing: "claude-sonnet-5-5", utility: "claude-haiku-5-5" },
  openai: { writing: "gpt-6.1-sol", utility: "gpt-6-luna" },
} as const;
export type TextProvider = keyof typeof TEXT_MODELS;
export type TextTask = "writing" | "classification" | "routing";
export interface WriterIdentity { provider: TextProvider; model: string }
export interface TextResult extends WriterIdentity { text: string }
export interface TextOptions {
  systemPrompt: string;
  userPrompt: string;
  maxTokens?: number;
  effort?: "low" | "medium" | "high";
  jsonSchema?: Record<string, unknown>;
  task?: TextTask;
  timeoutMs?: number;
  images?: { base64: string; mimeType: string }[];
}
export interface TextConfig {
  provider: TextProvider;
  apiKey: string;
  settings?: Record<string, unknown>;
  fallback?: TextConfig;
}
const FAILURE = "The writing assistant could not complete this request. Please try again, or ask AGENCY to check it.";
export const NO_PROVIDER = "No AI provider is configured for this company. Ask AGENCY to set it up.";
export function textProvider(value: unknown): TextProvider {
  if (value === "claude" || value === "anthropic_claude") return "claude";
  if (value === "openai" || value === "openai_gpt4") return "openai";
  throw new Error("The configured writing provider is not supported. Ask AGENCY to update it.");
}
export function companyTextConfig(provider: unknown, credentials: Record<string, unknown>, settings: Record<string, unknown>): TextConfig {
  const apiKey = typeof credentials.api_key === "string" ? credentials.api_key : "";
  if (!apiKey) throw new Error(NO_PROVIDER);
  return { provider: textProvider(provider), apiKey, settings };
}
export function sharedTextConfig(env: Partial<NodeJS.ProcessEnv> = process.env): TextConfig {
  const provider = env.AI_TEXT_PROVIDER ? textProvider(env.AI_TEXT_PROVIDER) : env.ANTHROPIC_API_KEY ? "claude" : "openai";
  const other = provider === "claude" ? "openai" : "claude";
  const key = (p: TextProvider) => p === "claude" ? env.ANTHROPIC_API_KEY : env.OPENAI_API_KEY;
  const apiKey = key(provider);
  if (!apiKey) throw new Error(NO_PROVIDER);
  return {
    provider, apiKey,
    ...(env.AI_TEXT_FALLBACK_APPROVED === "true" && key(other)
      ? { fallback: { provider: other, apiKey: key(other)! } } : {}),
  };
}
export async function resolveTextConfig(companyId?: string): Promise<TextConfig> {
  if (companyId) {
    const config = await resolveProvider(companyId, "content_generation");
    if (config) return companyTextConfig(config.provider, config.credentials, config.settings);
  }
  return sharedTextConfig();
}
export function modelFor(config: TextConfig, options: TextOptions): string {
  // Only bounded, structured classification and routing qualify for the cheaper tier.
  const utility = (options.task === "classification" || options.task === "routing")
    && !!options.jsonSchema && (options.maxTokens ?? 2000) <= 2048
    && options.systemPrompt.length + options.userPrompt.length <= 24000
    && config.settings?.utility_tier !== "quality";
  return TEXT_MODELS[config.provider][utility ? "utility" : "writing"];
}
class TransportError extends Error {
  constructor(readonly transient: boolean, readonly fallbackAllowed = transient) { super(FAILURE); }
}
/** Native funding errors cannot recover on retry, but may use an approved fallback. */
async function fundingFailure(response: Response, provider: TextProvider): Promise<boolean> {
  if (![400, 402, 429].includes(response.status)) return false;
  const payload = await response.json().catch(() => null);
  const error = payload?.error;
  if (!error || typeof error !== "object") return false;
  if (provider === "openai") return response.status === 429 && (
    error.type === "insufficient_quota" || ["insufficient_quota", "credit_balance_exhausted", "organization_spend_limit_exceeded", "project_spend_limit_exceeded", "organization_usage_limit_exceeded"].includes(error.code)
  );
  if (response.status === 402) return error.type === "billing_error";
  if (response.status === 429) return error.type === "rate_limit_error" && error.details?.error_code === "enforced_spend_limit_reached";
  return error.type === "invalid_request_error" && typeof error.message === "string" && (
    /^Your credit balance is too low to access the Anthropic API\./.test(error.message)
    || /^You have reached your specified (?:workspace )?API usage limits\b/.test(error.message)
  );
}
function schemaCheck(value: unknown, schema: Record<string, unknown>): boolean {
  if (Array.isArray(schema.enum) && !schema.enum.includes(value)) return false;
  if (Array.isArray(schema.anyOf)) return schema.anyOf.some(s => schemaCheck(value, s));
  const type = schema.type;
  if (Array.isArray(type)) return type.some(t => schemaCheck(value, { ...schema, type: t }));
  if (type === "null") return value === null;
  if (type === "string") return typeof value === "string";
  if (type === "boolean") return typeof value === "boolean";
  if (type === "number" || type === "integer") return typeof value === "number" && Number.isFinite(value) && (type !== "integer" || Number.isInteger(value));
  if (type === "array") return Array.isArray(value) && value.every(v => !schema.items || schemaCheck(v, schema.items as Record<string, unknown>));
  if (type === "object") {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const object = value as Record<string, unknown>;
    const properties = (schema.properties ?? {}) as Record<string, Record<string, unknown>>;
    if (Array.isArray(schema.required) && schema.required.some(k => typeof k === "string" && !(k in object))) return false;
    return Object.keys(object).every(k => k in properties ? schemaCheck(object[k], properties[k]) : schema.additionalProperties !== false);
  }
  return true;
}
/** A single deadline covers primary, its one transient retry, and approved fallback. */
export async function requestText(config: TextConfig, options: TextOptions, fetcher: typeof fetch = fetch): Promise<TextResult> {
  const controller = new AbortController();
  const timeout = Math.max(1, Math.min(options.timeoutMs ?? 60000, 90000));
  let timer: ReturnType<typeof setTimeout>;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => { controller.abort(); reject(new Error(FAILURE)); }, timeout);
  });
  async function call(selected: TextConfig): Promise<TextResult> {
    const model = modelFor(selected, options);
    const anthropic = selected.provider === "claude";
    const content = options.images?.length ? [
      ...options.images.map(i => anthropic
        ? { type: "image", source: { type: "base64", media_type: i.mimeType, data: i.base64 } }
        : { type: "input_image", image_url: `data:${i.mimeType};base64,${i.base64}`, detail: "auto" }),
      { type: anthropic ? "text" : "input_text", text: options.userPrompt },
    ] : options.userPrompt;
    const body = anthropic ? {
      model, max_tokens: options.maxTokens ?? 2000,
      thinking: { type: model === TEXT_MODELS.claude.utility ? "disabled" : "between_tools" },
      output_config: { effort: options.effort ?? "low", ...(options.jsonSchema ? { format: { type: "json_schema", schema: options.jsonSchema } } : {}) },
      system: options.systemPrompt, messages: [{ role: "user", content }],
    } : {
      model, store: false, instructions: options.systemPrompt,
      input: [{ role: "user", content }], max_output_tokens: options.maxTokens ?? 2000,
      reasoning: { effort: options.effort ?? "low" },
      ...(options.jsonSchema ? { text: { format: { type: "json_schema", name: "result", strict: true, schema: options.jsonSchema } } } : {}),
    };
    for (let attempt = 0; attempt < 2; attempt++) {
      if (controller.signal.aborted) throw new Error(FAILURE);
      try {
        const response = await fetcher(anthropic ? "https://api.anthropic.com/v1/messages" : "https://api.openai.com/v1/responses", {
          method: "POST", signal: controller.signal,
          headers: { "Content-Type": "application/json", ...(anthropic ? { "x-api-key": selected.apiKey, "anthropic-version": "2023-06-01" } : { Authorization: `Bearer ${selected.apiKey}` }) },
          body: JSON.stringify(body),
        }).catch(() => { throw new TransportError(!controller.signal.aborted); });
        if (!response.ok) {
          const funding = await fundingFailure(response, selected.provider);
          const transient = response.status === 429 || response.status >= 500;
          throw new TransportError(!funding && transient, funding || transient);
        }
        const data = await response.json();
        if (anthropic ? data.stop_reason === "max_tokens" : data.status && data.status !== "completed") throw new TransportError(false);
        // Verify the answering model if present; never label an unexpected model as the selected one.
        const suffix = typeof data.model === "string" && data.model.startsWith(model + "-") ? data.model.slice(model.length + 1) : "";
        if (data.model !== model && !/^(?:\d{8}|\d{4}-\d{2}-\d{2})$/.test(suffix)) throw new TransportError(false);
        const text = anthropic
          ? data.content?.filter((c: { type: string }) => c.type === "text").map((c: { text: string }) => c.text).join("")
          : data.output?.filter((o: { type: string }) => o.type === "message").flatMap((o: { content?: { type: string; text?: string }[] }) => o.content ?? []).filter((c: { type: string }) => c.type === "output_text").map((c: { text: string }) => c.text).join("");
        if (!text?.trim()) throw new TransportError(false);
        if (options.jsonSchema && !schemaCheck(JSON.parse(text), options.jsonSchema)) throw new TransportError(false);
        return { text, provider: selected.provider, model: data.model };
      } catch (error) {
        if (!(error instanceof TransportError && error.transient && attempt === 0)) throw error;
      }
    }
    throw new Error(FAILURE);
  }
  try {
    return await Promise.race([(async () => {
      try { return await call(config); }
      catch (error) {
        if (!controller.signal.aborted && config.fallback && error instanceof TransportError && error.fallbackAllowed) return call(config.fallback);
        throw error;
      }
    })(), deadline]);
  } catch { throw new Error(FAILURE); }
  finally { clearTimeout(timer!); }
}
