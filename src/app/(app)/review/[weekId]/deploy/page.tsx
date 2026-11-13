import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createServerSupabaseClient, getUserProfile } from "@/lib/supabase/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import DeployWeekPanel from "@/components/review/DeployWeekPanel";
import { planWeekDeploy, type DeployPiece } from "@/lib/publishing/deploy-week";
import { formatWeekLabel } from "@/lib/utils/format-week-label";

interface PageProps {
  params: Promise<{ weekId: string }>;
}

const ukTime = (iso: string) => new Date(iso).toLocaleString("en-GB", {
  timeZone: "Europe/London", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
});

/**
 * Deploy week: what one confirmed action will do with a fully approved
 * week, the action itself, and (after it runs) the steps left by hand.
 * Loading this page changes nothing.
 */
export default async function DeployWeekPage({ params }: PageProps) {
  const { weekId } = await params;
  const profile = await getUserProfile();
  if (!profile) return null;
  const venue = profile.company as { post_pack?: string | null } | null | undefined;
  if (profile.role !== "admin" && venue?.post_pack === "hospitality") redirect("/review");

  // The signed-in user's own client: a week they cannot see is not found.
  const supabase = await createServerSupabaseClient();
  const { data: week } = await supabase.from("weeks").select("*, company:companies(*)").eq("id", weekId).single();
  if (!week) notFound();
  const company = week.company as { id: string; name: string; slug?: string | null; post_pack?: string | null };
  if (company.post_pack === "hospitality") redirect("/review");

  const { data: pieceRows } = await supabase.from("content_pieces")
    .select("id, title, content_type, approval_status, day_of_week, scheduled_time, scheduled_date")
    .eq("week_id", weekId).eq("company_id", company.id).order("sort_order", { ascending: true });
  const plan = planWeekDeploy((pieceRows || []) as DeployPiece[], week.date_start);
  const canPublish = profile.role === "admin" || !!profile.can_publish;

  // Account names only, for this company (the user can see its week).
  const admin = await createAdminSupabaseClient();
  const { data: accountRows } = await admin.from("company_social_accounts").select("id, account_name")
    .eq("company_id", company.id).eq("platform", "linkedin_personal").eq("is_active", true);
  const accounts = (accountRows || []).map((a) => ({ id: a.id as string, name: (a.account_name as string) || "LinkedIn profile" }));
  const isPlatformCompany = company.slug === (process.env.PLATFORM_COMPANY_SLUG || "agency-bristol");
  const showCtaPicker = profile.role === "admin" && isPlatformCompany && plan.blogs.length > 0;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <Link href="/review" className="hover:text-gray-700">Weeks</Link>
        <span>/</span>
        <Link href={`/review/${weekId}`} className="hover:text-gray-700">{formatWeekLabel(week.date_start, week.week_number)}</Link>
        <span>/</span>
        <span className="text-gray-900">Deploy</span>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <h1 className="text-2xl font-bold text-gray-900">Deploy {formatWeekLabel(week.date_start, week.week_number)}</h1>
        <p className="mt-1 text-sm text-gray-500">{company.name}</p>

        {!plan.ready ? (
          <p className="mt-4 text-sm text-gray-700">
            {plan.unapproved > 0
              ? `${plan.unapproved} ${plan.unapproved === 1 ? "piece is" : "pieces are"} not approved yet. Approve the whole week before deploying it.`
              : "This week has nothing to deploy."}{" "}
            <Link href={`/review/${weekId}`} className="underline">Back to the week</Link>
          </p>
        ) : (
          <>
            <h2 className="mt-6 text-sm font-semibold text-gray-900">What Deploy week will do</h2>
            <ul className="mt-2 space-y-1 text-sm text-gray-700">
              {plan.social.length === 0 && <li>No posts can be queued for LinkedIn.</li>}
              {plan.social.map((p) => (
                <li key={p.pieceId}>Queue for LinkedIn: {p.title}, {ukTime(p.scheduledFor)}</li>
              ))}
              {plan.social.length > 0 && accounts.length === 0 && <li>No LinkedIn account is connected, so these posts will not be queued.</li>}
              {plan.blogs.map((b) => (
                <li key={b.id}>{showCtaPicker ? `Open a pull request on the website for the blog: ${b.title}` : `Blog left for you to publish: ${b.title}`}</li>
              ))}
            </ul>

            <h2 className="mt-6 text-sm font-semibold text-gray-900">What stays manual</h2>
            <ul className="mt-2 space-y-1 text-sm text-gray-700">
              {plan.manualSocial.map((p) => <li key={p.pieceId}>Not queued: {p.title}. {p.reason}</li>)}
              {plan.blogs.length > 0 && <li>Publishing the blog post: merging its pull request.</li>}
              <li>Uploading the scheduler export for channels without direct publishing.</li>
              {plan.newsletters.map((n) => <li key={n.id}>Publishing the newsletter: {n.title}, from its copy page.</li>)}
            </ul>

            <div className="mt-6">
              {canPublish
                ? <DeployWeekPanel weekId={weekId} accounts={accounts} queueCount={plan.social.length} showCtaPicker={showCtaPicker} />
                : <p className="text-sm text-gray-700">Your account cannot publish. Ask AGENCY to switch publishing on.</p>}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
