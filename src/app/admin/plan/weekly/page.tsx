import { redirect } from "next/navigation";
import { requireAdmin, createAdminSupabaseClient } from "@/lib/supabase/admin";
import { isWeekBoardEnabled, WEEK_BOARD_FEATURE_FLAG } from "@/lib/constants/week-board";
import {
  getCalendarBoardData,
  currentAndNextIsoWeek,
  pickWeekGroups,
  earliestGroupFrom,
} from "@/lib/calendar-slots/data";
import WeeklyPlanningView from "@/components/admin/WeeklyPlanningView";

export default async function AdminWeeklyPlanningPage() {
  const admin = await requireAdmin();
  if (!admin) redirect("/dashboard");

  if (!isWeekBoardEnabled()) {
    return (
      <div className="max-w-lg space-y-3">
        <h1 className="text-2xl font-bold text-gray-900">Slot Planner</h1>
        <div className="rounded-lg border border-gray-200 bg-white p-6 text-sm text-gray-600">
          <p className="font-medium text-gray-900">
            Not enabled in this environment.
          </p>
          <p className="mt-2">
            Set{" "}
            <code className="rounded bg-gray-100 px-1.5 py-0.5 text-xs">
              {WEEK_BOARD_FEATURE_FLAG}=true
            </code>{" "}
            to turn it on.
          </p>
        </div>
      </div>
    );
  }

  const supabase = await createAdminSupabaseClient();
  const allWeeks = await getCalendarBoardData(supabase);
  const { current, next } = currentAndNextIsoWeek();
  const matched = pickWeekGroups(allWeeks, [current, next]);
  const todayStr = new Date().toISOString().slice(0, 10);
  const nearestUpcoming = matched.length === 0 ? earliestGroupFrom(allWeeks, todayStr) : null;

  return (
    <WeeklyPlanningView
      currentWeekTarget={current}
      nextWeekTarget={next}
      weeks={matched}
      nearestUpcoming={nearestUpcoming}
    />
  );
}
