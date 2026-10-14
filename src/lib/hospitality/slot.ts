import { addDays, todayIn } from "./week";

/**
 * When a post written now should go out, if the person does not say.
 * Before 11:30 venue time: today at 12:00. Before 17:30: today at 18:00.
 * Later: tomorrow at 12:00. Never a time that has already passed.
 */
export function defaultPostSlot(timeZone: string, now: Date = new Date()): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  const minutes = hour * 60 + minute;
  const today = todayIn(timeZone, now);
  if (minutes < 11 * 60 + 30) return { date: today, time: "12:00" };
  if (minutes < 17 * 60 + 30) return { date: today, time: "18:00" };
  return { date: addDays(today, 1), time: "12:00" };
}
