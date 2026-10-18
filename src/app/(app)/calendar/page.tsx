import type { Metadata } from "next";
import { createServerSupabaseClient, getUserProfile } from "@/lib/supabase/server";
import ContentCalendar from "@/components/calendar/ContentCalendar";
import UpgradeGate from "@/components/billing/UpgradeGate";
import { getEffectivePlan } from "@/lib/utils/get-effective-plan";
import { getPlanFeatures } from "@/lib/utils/plan-limits";
import type { PlanTier } from "@/types/database";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import DayList from "@/components/hospitality/DayList";
import { todayIn } from "@/lib/hospitality/week";
import { captionFirstLine, groupByDay, nextDays, timeLabel } from "@/lib/hospitality/week-view";

/** The next fortnight for a venue: a plain list of days, no drag and no grid. */
async function VenueDays({ companyId, timezone }: { companyId: string; timezone: string }) {
  const today = todayIn(timezone);
  const dates = nextDays(today, 14);
  const supabase = await createAdminSupabaseClient();
  const { data: rows } = await supabase
    .from("content_pieces")
    .select("id, title, markdown_body, scheduled_date, scheduled_time, approval_status")
    .eq("company_id", companyId)
    .eq("content_type", "social_post")
    .in("approval_status", ["pending", "approved", "changes_requested"])
    .gte("scheduled_date", dates[0])
    .lte("scheduled_date", dates[dates.length - 1]);
  const posts = ((rows || []) as Array<{ id: string; title: string | null; markdown_body: string | null; scheduled_date: string; scheduled_time: string | null; approval_status: string }>).map((r) => ({
    id: r.id,
    scheduled_date: r.scheduled_date,
    scheduled_time: r.scheduled_time,
    date: r.scheduled_date,
    title: r.title?.trim() || captionFirstLine(r.markdown_body) || "Post",
    status: r.approval_status,
    time: timeLabel(r.scheduled_time),
  }));
  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <p className="workspace-eyebrow">See the bigger picture</p>
        <h1 className="workspace-title">The next two weeks</h1>
        <p className="mt-1 text-sm text-gray-600">Every post with a day, one day under the next. Tap Move to put a post on another day.</p>
      </div>
      <DayList days={groupByDay(posts, dates, today)} firstDate={today} />
    </div>
  );
}

export const metadata: Metadata = {
  title: "Content Calendar | AGENCY",
  description: "View and manage scheduled content",
};

export default async function CalendarPage() {
  const profile = await getUserProfile();
  if (!profile) return null;

  const supabase = await createServerSupabaseClient();
  const isAdmin = profile.role === "admin";

  const venue = profile.company as { post_pack?: string | null; timezone?: string | null } | null | undefined;
  if (!isAdmin && profile.company_id && venue?.post_pack === "hospitality") {
    return <VenueDays companyId={profile.company_id} timezone={venue.timezone || "Europe/London"} />;
  }

  // Fetch companies for the company picker
  type CompanyInfo = { id: string; name: string; brand_color: string | null };
  let companies: CompanyInfo[] = [];

  if (isAdmin) {
    const { data } = await supabase
      .from("companies")
      .select("id, name, brand_color")
      .order("name");
    companies = data || [];
  } else if (profile.company_id) {
    const { data } = await supabase
      .from("companies")
      .select("id, name, brand_color")
      .eq("id", profile.company_id)
      .single();
    if (data) companies = [data];
  }

  // Plan check — calendar is Pro+ only
  if (!isAdmin && profile.company_id) {
    const { data: planData } = await supabase
      .from("companies")
      .select("plan, trial_plan, trial_expires_at")
      .eq("id", profile.company_id)
      .single();
    if (planData) {
      const plan = getEffectivePlan(planData as { plan: PlanTier; trial_plan?: PlanTier | null; trial_expires_at?: string | null });
      if (!getPlanFeatures(plan).contentCalendar) {
        return (
          <div className="p-6">
            <UpgradeGate allowed={false} featureName="Content Calendar" requiredPlan="pro" companyId={profile.company_id}>
              <div />
            </UpgradeGate>
          </div>
        );
      }
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="workspace-eyebrow">See the bigger picture</p>
        <h1 className="workspace-title">Content Calendar</h1>
        <p className="workspace-description">
          Your drafts, dates and weekly rhythm in one place.
        </p>
      </div>

      {companies.length > 0 ? (
        <ContentCalendar
          companies={companies}
          showCompanyPicker={isAdmin && companies.length > 1}
        />
      ) : (
        <div className="rounded-lg border border-dashed border-gray-300 p-8 text-center">
          <p className="text-sm text-gray-500">No companies configured yet.</p>
        </div>
      )}
    </div>
  );
}
