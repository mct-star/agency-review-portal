import type { CadenceMode } from "@/types/database";

export const CADENCE_MODES: readonly CadenceMode[] = ["weekly_batch", "daily", "posting_days"];
export const MAX_REMINDER_RECIPIENTS = 10;
export const DEFAULT_CADENCE = { mode: "weekly_batch" as CadenceMode, reminder_hour: 8, reminder_recipients: [] as string[] };

export interface CadenceValues {
  mode: CadenceMode;
  reminder_hour: number;
  reminder_recipients: string[];
}

export type CadenceParse = { ok: true; value: CadenceValues } | { ok: false; error: string };

// One @, no spaces, a dotted domain with no empty labels.
const EMAIL = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;

export function parseCadenceInput(input: {
  mode?: unknown;
  reminderHour?: unknown;
  reminderRecipients?: unknown;
}): CadenceParse {
  const { mode, reminderHour, reminderRecipients } = input;
  if (typeof mode !== "string" || !(CADENCE_MODES as readonly string[]).includes(mode)) {
    return { ok: false, error: "Choose one of the three reminder styles." };
  }
  if (typeof reminderHour !== "number" || !Number.isInteger(reminderHour) || reminderHour < 0 || reminderHour > 23) {
    return { ok: false, error: "The reminder hour must be a whole number from 0 to 23." };
  }
  if (!Array.isArray(reminderRecipients)) {
    return { ok: false, error: "Reminder recipients must be a list of email addresses." };
  }
  const emails: string[] = [];
  for (const raw of reminderRecipients) {
    const email = typeof raw === "string" ? raw.trim().toLowerCase() : "";
    if (!EMAIL.test(email) || email.length > 254) {
      return { ok: false, error: `"${typeof raw === "string" ? raw : ""}" is not a valid email address.` };
    }
    if (!emails.includes(email)) emails.push(email);
  }
  if (emails.length > MAX_REMINDER_RECIPIENTS) {
    return { ok: false, error: `Add at most ${MAX_REMINDER_RECIPIENTS} reminder email addresses.` };
  }
  return { ok: true, value: { mode: mode as CadenceMode, reminder_hour: reminderHour, reminder_recipients: emails } };
}
