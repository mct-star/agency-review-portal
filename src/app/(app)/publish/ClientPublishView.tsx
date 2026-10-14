import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { longDateLabel } from "@/lib/hospitality/week";
import MetricoolExportButton from "@/components/weeks/MetricoolExportButton";

const PLATFORM_LABELS: Record<string, string> = {
  linkedin_company: "LinkedIn company page",
  linkedin_personal: "LinkedIn profile",
  facebook: "Facebook",
  instagram: "Instagram",
  twitter: "X",
  bluesky: "Bluesky",
};

/**
 * What a client sees on Publish: the download of their approved posts and
 * which accounts are connected. Direct publishing is switched on by AGENCY,
 * so there is nothing here that publishes.
 */
export default async function ClientPublishView({ companyId }: { companyId: string }) {
  const supabase = await createAdminSupabaseClient();

  const [{ data: approved }, { data: accounts }] = await Promise.all([
    supabase
      .from("content_pieces")
      .select("week_id")
      .eq("company_id", companyId)
      .eq("approval_status", "approved")
      .eq("content_type", "social_post"),
    supabase
      .from("company_social_accounts")
      .select("platform, account_name")
      .eq("company_id", companyId)
      .eq("is_active", true),
  ]);

  const counts = new Map<string, number>();
  for (const r of approved || []) {
    const id = r.week_id as string | null;
    if (id) counts.set(id, (counts.get(id) || 0) + 1);
  }
  const weekIds = [...counts.keys()];
  const { data: weeks } = weekIds.length
    ? await supabase
        .from("weeks")
        .select("id, date_start, date_end")
        .eq("company_id", companyId)
        .in("id", weekIds)
        .order("date_start", { ascending: false })
    : { data: [] as Array<{ id: string; date_start: string; date_end: string }> };

  return (
    <div className="max-w-3xl space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Publish</h1>

      <section className="space-y-3 rounded-lg border border-gray-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-gray-900">Download this week&apos;s posts</h2>
        {(weeks || []).length === 0 ? (
          <p className="text-sm text-gray-600">You have no approved posts yet. Approve a post and it will appear here.</p>
        ) : (
          <ul className="space-y-3">
            {(weeks || []).map((w) => (
              <li key={w.id} className="flex flex-wrap items-center justify-between gap-3 text-sm text-gray-800">
                <span>
                  {longDateLabel(w.date_start)} to {longDateLabel(w.date_end)}: {counts.get(w.id)} approved{" "}
                  {counts.get(w.id) === 1 ? "post" : "posts"}
                </span>
                <MetricoolExportButton weekId={w.id} draft={false} />
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-gray-500">The file has only the posts you have approved, with their days and times, ready for your scheduling tool.</p>
      </section>

      <section className="space-y-3 rounded-lg border border-gray-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-gray-900">Connected accounts</h2>
        {(accounts || []).length === 0 ? (
          <p className="text-sm text-gray-600">No accounts are connected yet.</p>
        ) : (
          <ul className="space-y-1 text-sm text-gray-800">
            {(accounts || []).map((a, i) => (
              <li key={`${a.platform}-${i}`}>
                {PLATFORM_LABELS[a.platform as string] || (a.platform as string)}
                {a.account_name ? `: ${a.account_name}` : ""}
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-gray-500">
          Direct publishing is switched on by AGENCY once an account is connected. Until then, download your posts and
          schedule them yourself.
        </p>
      </section>
    </div>
  );
}
