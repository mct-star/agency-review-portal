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
  /**
   * Unused, distinct-scene photos banked for this week's company
   * (photo_inventory: distinct_scene true, used_in_weeks empty). A
   * company-level supply figure, not a per-week one, so every week
   * belonging to the same company carries the same number.
   */
  unused_photo_count: number;
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
 * Unused photo supply, per company. Mirrors the predicate on
 * idx_photo_inventory_unused exactly: distinct_scene = true and
 * used_in_weeks = '{}'. The empty array has to be passed through
 * .filter() rather than .eq(), because postgrest-js builds an .eq()
 * value with a plain template-literal join (`eq.${value}`), which
 * turns an empty JS array into the bare string "eq." rather than
 * the Postgres array literal "eq.{}" the column actually needs.
 *
 * One query per distinct company, not a single grouped query,
 * because supabase-js has no group-by count and the board's company
 * count is small enough that an RPC is not worth adding for it.
 */
async function getUnusedPhotoCounts(
  supabase: SupabaseClient,
  companyIds: string[]
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();

  await Promise.all(
    companyIds.map(async (companyId) => {
      const { count } = await supabase
        .from("photo_inventory")
        .select("id", { count: "exact", head: true })
        .eq("company_id", companyId)
        .eq("distinct_scene", true)
        .filter("used_in_weeks", "eq", "{}");

      counts.set(companyId, count ?? 0);
    })
  );

  return counts;
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

  const companyIds = Array.from(new Set(visible.map((w) => w.company_id)));
  const unusedPhotoCounts = await getUnusedPhotoCounts(supabase, companyIds);

  const weeks: WeekBoardRow[] = visible.map((w) => ({
    ...w,
    current_job: w.current_job_id ? jobsById.get(w.current_job_id) || null : null,
    unused_photo_count: unusedPhotoCounts.get(w.company_id) ?? 0,
  }));

  return { weeks, hiddenCount };
}
