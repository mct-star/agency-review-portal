import type { SupabaseClient } from "@supabase/supabase-js";
import type { Week, ContentGenerationJob } from "@/types/database";

export interface WeekBoardCompany {
  id: string;
  name: string;
  slug: string;
}

export interface WeekBoardRow extends Week {
  company: WeekBoardCompany | null;
  current_job: ContentGenerationJob | null;
}

export interface WeekBoardData {
  weeks: WeekBoardRow[];
  hiddenCount: number;
}

/**
 * Known parser artefact: a "VERSION HISTORY" section heading that the
 * local production pipeline's markdown parser once mis-read as a week
 * entry (week_number 11). week_number 0 ("Standalone content") is a
 * deliberate ad-hoc content container, not an artefact, and is left
 * visible. See POST /api/weeks, which defaults weekNumber to 0 for
 * exactly this purpose.
 */
function isParserArtefact(week: Week): boolean {
  const title = (week.title || "").trim().toLowerCase();
  return title === "version history" || title.startsWith("version history");
}

/**
 * Fetch every week for the Week Board, joined to its current
 * generation job. Known parser-artefact rows are filtered out and
 * counted, never silently dropped. Shared by the board page (first
 * paint) and the board list API route (polling refresh) so the two
 * never drift.
 */
export async function getWeekBoardData(
  supabase: SupabaseClient
): Promise<WeekBoardData> {
  const { data: allWeeks, error } = await supabase
    .from("weeks")
    .select("*, company:companies(id, name, slug)")
    .order("date_start", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  const rows = (allWeeks || []) as (Week & {
    company: WeekBoardCompany | null;
  })[];

  const visible = rows.filter((w) => !isParserArtefact(w));
  const hiddenCount = rows.length - visible.length;

  const jobIds = visible
    .map((w) => w.current_job_id)
    .filter((id): id is string => Boolean(id));

  let jobsById = new Map<string, ContentGenerationJob>();
  if (jobIds.length > 0) {
    const { data: jobs, error: jobsErr } = await supabase
      .from("content_generation_jobs")
      .select("*")
      .in("id", jobIds);

    if (jobsErr) {
      throw new Error(jobsErr.message);
    }

    jobsById = new Map(
      (jobs || []).map((j: ContentGenerationJob) => [j.id, j])
    );
  }

  const weeks: WeekBoardRow[] = visible.map((w) => ({
    ...w,
    current_job: w.current_job_id ? jobsById.get(w.current_job_id) || null : null,
  }));

  return { weeks, hiddenCount };
}
