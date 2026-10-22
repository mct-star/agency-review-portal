import type { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { attachLibraryItemToPiece } from "@/lib/media/attach";
import { dayNameOf, formatDate, isoWeekOfDate, mondayOf, addDays, hhmm } from "./week";
import { wordCount } from "./prompts";

type SupabaseAdmin = Awaited<ReturnType<typeof createAdminSupabaseClient>>;

export interface WeekRef {
  id: string;
  week_number: number;
  year: number;
  date_start: string;
}

/** The week row holding a date, created if it does not exist yet. */
export async function ensureWeek(supabase: SupabaseAdmin, companyId: string, ymd: string): Promise<WeekRef> {
  const { week, year } = isoWeekOfDate(ymd);
  const start = mondayOf(ymd);
  const { data: existing } = await supabase
    .from("weeks")
    .select("id, week_number, year, date_start")
    .eq("company_id", companyId)
    .eq("week_number", week)
    .eq("year", year)
    .maybeSingle();
  if (existing) return existing as WeekRef;

  const { data, error } = await supabase
    .from("weeks")
    .insert({
      company_id: companyId,
      week_number: week,
      year,
      date_start: start,
      date_end: addDays(start, 6),
      title: `Week ${week}`,
      status: "draft",
    })
    .select("id, week_number, year, date_start")
    .single();
  if (error || !data) {
    // Two drafts racing to create the same week: the loser reads the winner's row.
    const { data: again } = await supabase
      .from("weeks")
      .select("id, week_number, year, date_start")
      .eq("company_id", companyId)
      .eq("week_number", week)
      .eq("year", year)
      .maybeSingle();
    if (again) return again as WeekRef;
    throw new Error(`Could not create the week: ${error?.message ?? "unknown error"}`);
  }
  return data as WeekRef;
}

export interface DraftInput {
  companyId: string;
  postTypeSlug: string;
  title: string;
  body: string;
  /** YYYY-MM-DD */
  scheduledDate: string;
  /** HH:MM or HH:MM:SS */
  scheduledTime: string;
  autoSource: "weather_job" | "weekly_interview" | "quick_post";
  sourceMeta?: Record<string, unknown>;
  imageIds?: string[];
}

export interface DraftResult {
  pieceId: string;
  weekId: string;
  imagesAttached: number;
  imageError?: string;
}

/**
 * A post waiting for a person. It always starts `pending`: nothing an
 * automation writes is approved, exported or published until a company user
 * approves it.
 */
export async function createHospitalityDraft(supabase: SupabaseAdmin, input: DraftInput): Promise<DraftResult> {
  const week = await ensureWeek(supabase, input.companyId, input.scheduledDate);

  const { count } = await supabase
    .from("content_pieces")
    .select("id", { count: "exact", head: true })
    .eq("week_id", week.id);

  const { data: piece, error } = await supabase
    .from("content_pieces")
    .insert({
      week_id: week.id,
      company_id: input.companyId,
      content_type: "social_post",
      title: input.title.slice(0, 200),
      day_of_week: dayNameOf(input.scheduledDate),
      scheduled_date: input.scheduledDate,
      scheduled_time: hhmm(input.scheduledTime),
      markdown_body: input.body,
      post_type: input.postTypeSlug,
      word_count: wordCount(input.body.split("\n\n#")[0]),
      sort_order: count ?? 0,
      approval_status: "pending",
      auto_source: input.autoSource,
      source_meta: input.sourceMeta ?? null,
    })
    .select("id")
    .single();
  if (error || !piece) throw new Error(`Could not save the draft: ${error?.message ?? "unknown error"}`);

  let attached = 0;
  let imageError: string | undefined;
  for (const imageId of input.imageIds ?? []) {
    try {
      await attachLibraryItemToPiece(supabase, imageId, piece.id as string, { weekNumber: week.week_number });
      attached += 1;
    } catch (err) {
      imageError = err instanceof Error ? err.message : "A photo could not be added";
    }
  }
  return { pieceId: piece.id as string, weekId: week.id, imagesAttached: attached, imageError };
}

export { formatDate };
