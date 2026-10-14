import { storageCapBytes } from "@/lib/utils/plan-limits";
import type { PlanTier } from "@/types/database";

/**
 * Library storage quota. The cap is per plan (plan-limits.ts). It is only
 * ever used to refuse a new upload: nothing here, or anywhere, deletes a
 * file because a company is over its cap.
 */

const GB = 1024 * 1024 * 1024;
const MB = 1024 * 1024;

export interface QuotaState {
  usedBytes: number;
  capBytes: number;
  remainingBytes: number;
  fraction: number;
}

export function quotaState(usedBytes: number, plan: PlanTier | string): QuotaState {
  const capBytes = storageCapBytes(plan);
  const used = Math.max(0, usedBytes);
  return {
    usedBytes: used,
    capBytes,
    remainingBytes: Math.max(0, capBytes - used),
    fraction: capBytes > 0 ? Math.min(1, used / capBytes) : 1,
  };
}

export function formatBytes(bytes: number): string {
  if (bytes >= GB) return `${(bytes / GB).toFixed(bytes >= 10 * GB ? 0 : 1)} GB`;
  if (bytes >= MB) return `${Math.round(bytes / MB)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export type QuotaDecision = { allowed: true } | { allowed: false; message: string };

export function checkQuota(usedBytes: number, incomingBytes: number, plan: PlanTier | string): QuotaDecision {
  const s = quotaState(usedBytes, plan);
  if (usedBytes + incomingBytes <= s.capBytes) return { allowed: true };
  return {
    allowed: false,
    message: `Your library is full (${formatBytes(s.usedBytes)} of ${formatBytes(s.capBytes)}). Remove some files you no longer need, or ask us about a larger plan. Nothing has been deleted.`,
  };
}
