/** Shared contracts for API-only authoring jobs in the existing production queue. */
import type { createAdminSupabaseClient } from "@/lib/supabase/admin";
import type { CalendarSlot } from "@/types/database";

export type ProductionDb = Awaited<ReturnType<typeof createAdminSupabaseClient>>;
export const API_PRODUCTION_PROVIDER = "api_engine";
export const API_PRODUCTION_JOB_TYPE = "content_generation";

export interface DirectProductionBrief {
  post_type_slug: string;
  topic: string;
  post_date: string;
  post_time?: string | null;
  pillar?: string | null;
  notes?: string | null;
}

export interface ApiProductionInput {
  kind: "week" | "slot" | "direct";
  slot_id?: string;
  week_id?: string;
  mode?: "fresh" | "resume";
  direct?: DirectProductionBrief;
}

export interface ApiProductionOutput {
  slots?: Record<string, string>;
  content_piece_id?: string;
  image_url?: string;
  warnings?: string[];
  [key: string]: unknown;
}

export interface ApiProductionJob {
  id: string;
  company_id: string;
  week_id: string | null;
  status: string;
  input_payload: ApiProductionInput;
  output_payload: ApiProductionOutput | null;
  worker_id?: string | null;
  attempt?: number;
  max_attempts?: number;
  lease_expires_at?: string | null;
  run_id?: string | null;
}

export interface GeneratePlannedPieceArgs {
  db: ProductionDb;
  job: ApiProductionJob;
  workerId: string;
  slot?: CalendarSlot;
  /** Rechecks the lease before any new output is persisted. */
  assertOwnership: () => Promise<void>;
}

export interface GeneratedPlannedPiece {
  pieceId: string;
  imageUrl?: string;
  warnings: string[];
}
