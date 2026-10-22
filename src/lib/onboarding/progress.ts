/** Setup position is a user preference only. Company access always comes from the users row. */
export const SETUP_STEPS = ["brand", "voice", "connections", "create"] as const;
export type SetupStep = typeof SETUP_STEPS[number];
export type SetupProgress = { step: SetupStep };

export function stepsForPack(hospitality: boolean): SetupStep[] {
  return SETUP_STEPS.filter((step) => !hospitality || step !== "voice");
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function setupPreferences(metadata: unknown): Record<string, SetupProgress> {
  const stored = record(record(metadata).workspace_setup);
  if (stored.version !== 1) return {};
  const result: Record<string, SetupProgress> = {};
  for (const [companyId, value] of Object.entries(record(stored.companies))) {
    const step = record(value).step;
    if (/^[0-9a-f-]{36}$/i.test(companyId) && SETUP_STEPS.includes(step as SetupStep)) {
      result[companyId] = { step: step as SetupStep };
    }
  }
  return result;
}

export function progressForCompany(metadata: unknown, companyId: string, hospitality: boolean): SetupProgress | null {
  const progress = setupPreferences(metadata)[companyId];
  return progress && stepsForPack(hospitality).includes(progress.step) ? progress : null;
}

export function setupMetadata(metadata: unknown, companyId: string, step: SetupStep) {
  return { version: 1, companies: { ...setupPreferences(metadata), [companyId]: { step } } };
}
