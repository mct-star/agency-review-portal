import type { SupabaseClient } from "@supabase/supabase-js";
import { approvalRefusal, newestApprovals, type GatePiece } from "@/lib/content/approval-gate";
import { liveLinkedInJobsByPiece } from "@/lib/publishing/live-linkedin-jobs";
import { networksFor } from "./networks";

/**
 * The scheduler export as Deploy week leaves it (14 Nov 2026), opt-in with
 * ?leftForScheduler=true. Without the parameter the export is unchanged:
 * the Mac pipeline and every other caller get exactly what they got before.
 *
 * With it:
 * - a post already in the direct LinkedIn queue (queued, scheduled, running,
 *   published, or an uncertain failure) does not go to LinkedIn again. It
 *   keeps the company's other networks; with none left it is left out.
 * - a post whose newest recorded approval does not match its text is left
 *   out entirely, so the file carries only text someone approved.
 */
export const LEFT_FOR_SCHEDULER_PARAM = "leftForScheduler";

export type SchedulerDecision =
  | { include: true; networks: string[] | null; note: string | null }
  | { include: false; note: string };

/** Pure: what the export does with one post in this mode. */
export function decideLeftForScheduler(args: {
  title: string | null;
  companyNetworks: string[] | null | undefined;
  inLinkedInQueue: boolean;
  approvalRefusal: string | null;
}): SchedulerDecision {
  const label = args.title?.trim() || "A post";
  if (args.approvalRefusal) return { include: false, note: `${label} was left out of this file. ${args.approvalRefusal}` };
  if (!args.inLinkedInQueue) return { include: true, networks: null, note: null };
  const others = networksFor(args.companyNetworks).filter((n) => n !== "linkedin");
  if (!others.length) return { include: false, note: `${label} is already in the LinkedIn queue, so it was left out of this file.` };
  return { include: true, networks: others, note: `${label} is already in the LinkedIn queue, so this file sends it to the other networks only.` };
}

/** The live jobs and approval records for this mode, or null when either could not be read. */
export async function loadLeftForScheduler(
  supabase: SupabaseClient,
  companyId: string,
  pieces: GatePiece[],
): Promise<((piece: GatePiece & { title: string | null }, companyNetworks: string[] | null | undefined) => SchedulerDecision) | null> {
  const ids = pieces.map((p) => p.id);
  const [live, approvals] = await Promise.all([
    liveLinkedInJobsByPiece(supabase, companyId, ids),
    newestApprovals(supabase, companyId, ids),
  ]);
  if (!live || !approvals) return null;
  return (piece, companyNetworks) => decideLeftForScheduler({
    title: piece.title,
    companyNetworks,
    inLinkedInQueue: live.has(piece.id),
    approvalRefusal: approvalRefusal(piece, approvals.get(piece.id)),
  });
}
