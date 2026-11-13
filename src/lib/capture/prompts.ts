/**
 * Capture prompts: when to remind someone that a planned piece needs a
 * recording. Pure: takes the capture kind and the scheduled date, returns
 * calendar dates and a part of the day. The caller decides the clock time
 * and who is told.
 *
 *   casual  a talk-through on a phone: the evening before and the morning of
 *   shoot   needs lead time: seven days and two days before, never same-day
 *   none    nothing
 */
import type { PostTypeCapture } from "@/lib/constants/post-types";

export type CapturePromptKey = "evening_before" | "morning_of" | "seven_days" | "two_days";

export interface CapturePrompt {
  key: CapturePromptKey;
  /** Calendar date (YYYY-MM-DD) the prompt is due. */
  date: string;
  part: "morning" | "evening" | "day";
  daysBefore: number;
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})/;

function dayBefore(scheduled: string, days: number): string | null {
  const m = DATE_RE.exec(scheduled);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const base = new Date(Date.UTC(y, mo - 1, d));
  // Reject dates that roll over, such as 2026-02-31.
  if (base.getUTCFullYear() !== y || base.getUTCMonth() !== mo - 1 || base.getUTCDate() !== d) return null;
  base.setUTCDate(base.getUTCDate() - days);
  return base.toISOString().slice(0, 10);
}

export function capturePrompts(kind: PostTypeCapture, scheduledDate: string | null | undefined): CapturePrompt[] {
  if (!scheduledDate || (kind !== "casual" && kind !== "shoot")) return [];
  const plan: Array<Pick<CapturePrompt, "key" | "part" | "daysBefore">> =
    kind === "casual"
      ? [
          { key: "evening_before", part: "evening", daysBefore: 1 },
          { key: "morning_of", part: "morning", daysBefore: 0 },
        ]
      : [
          { key: "seven_days", part: "day", daysBefore: 7 },
          { key: "two_days", part: "day", daysBefore: 2 },
        ];
  const out: CapturePrompt[] = [];
  for (const p of plan) {
    const date = dayBefore(scheduledDate, p.daysBefore);
    if (!date) return [];
    out.push({ key: p.key, date, part: p.part, daysBefore: p.daysBefore });
  }
  return out;
}
