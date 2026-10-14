import type { Metadata } from "next";
import Link from "next/link";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { getUserProfile } from "@/lib/supabase/server";
import { getPostType } from "@/lib/constants/post-types";
import { longDateLabel } from "@/lib/hospitality/week";
import ApprovalCard, { type DraftPiece } from "@/components/hospitality/ApprovalCard";
import MetricoolExportButton from "@/components/weeks/MetricoolExportButton";
import { addDays, longDateLabel as dateLabel, todayIn } from "@/lib/hospitality/week";

export const metadata: Metadata = { title: "Waiting for you | AGENCY" };
export const dynamic = "force-dynamic";

/**
 * Everything waiting for a person: photos from the team and posts drafted for
 * them (the daily weather post, the weekly chat, a quick post). Nothing here
 * is published or exported until it is approved.
 */
export default async function ApprovalsPage({ searchParams }: { searchParams: Promise<{ company?: string }> }) {
  const profile = await getUserProfile();
  if (!profile) return null;
  const params = await searchParams;
  const isAdmin = profile.role === "admin";
  const companyId = isAdmin ? params.company || profile.company_id : profile.company_id;
  if (!companyId) return <p className="text-sm text-gray-600">Choose a company first.</p>;

  const supabase = await createAdminSupabaseClient();
  const [{ data: company }, { count: photosWaiting }, { data: rows }] = await Promise.all([
    supabase.from("companies").select("id, name").eq("id", companyId).maybeSingle(),
    supabase.from("photo_inventory").select("id", { count: "exact", head: true }).eq("company_id", companyId).eq("status", "pending"),
    supabase
      .from("content_pieces")
      .select("id, title, post_type, markdown_body, scheduled_date, scheduled_time, auto_source, source_meta")
      .eq("company_id", companyId)
      .eq("approval_status", "pending")
      .eq("content_type", "social_post")
      .order("scheduled_date", { ascending: true, nullsFirst: false })
      .order("scheduled_time", { ascending: true })
      .limit(60),
  ]);
  if (!company) return <p className="text-sm text-gray-600">Company not found.</p>;
  if (!isAdmin && profile.company_id !== companyId) return null;

  const list = (rows || []) as Array<{ id: string; title: string; post_type: string | null; markdown_body: string; scheduled_date: string | null; scheduled_time: string | null; auto_source: string | null; source_meta: { warnings?: string[] } | null }>;
  const ids = list.map((r) => r.id);
  const { data: images } = ids.length
    ? await supabase.from("content_images").select("content_piece_id, public_url, sort_order").in("content_piece_id", ids).order("sort_order")
    : { data: [] as Array<{ content_piece_id: string; public_url: string }> };
  const firstImage = new Map<string, string>();
  for (const i of images || []) if (!firstImage.has(i.content_piece_id)) firstImage.set(i.content_piece_id, i.public_url);

  const pieces: DraftPiece[] = list.map((r) => ({
    id: r.id,
    title: r.title,
    post_type: r.post_type,
    typeLabel: (r.post_type && getPostType(r.post_type)?.label) || r.title,
    body: r.markdown_body,
    scheduled_date: r.scheduled_date,
    scheduled_time: r.scheduled_time,
    auto_source: r.auto_source,
    imageUrl: firstImage.get(r.id) || null,
    warnings: r.source_meta?.warnings ?? [],
    whenLabel: r.scheduled_date ? `${longDateLabel(r.scheduled_date)}${r.scheduled_time ? ` at ${r.scheduled_time.slice(0, 5)}` : ""}` : "no date yet",
  }));

  // Approved posts, by week, ready to export. Only weeks that are not long past.
  const { data: tz } = await supabase.from("companies").select("timezone").eq("id", companyId).maybeSingle();
  const since = addDays(todayIn((tz?.timezone as string | null) || "Europe/London"), -7);
  const { data: approvedRows } = await supabase
    .from("content_pieces")
    .select("id, week_id, scheduled_date")
    .eq("company_id", companyId)
    .eq("approval_status", "approved")
    .eq("content_type", "social_post")
    .gte("scheduled_date", since);
  const byWeek = new Map<string, number>();
  for (const r of approvedRows || []) byWeek.set(r.week_id as string, (byWeek.get(r.week_id as string) || 0) + 1);
  const weekIds = [...byWeek.keys()];
  const { data: weekRows } = weekIds.length
    ? await supabase.from("weeks").select("id, week_number, date_start, date_end").in("id", weekIds).order("date_start")
    : { data: [] as Array<{ id: string; week_number: number; date_start: string; date_end: string }> };

  const nothing = pieces.length === 0 && !photosWaiting && (weekRows || []).length === 0;
  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Waiting for you</h1>
        <p className="mt-1 text-sm text-gray-500">{company.name}. Nothing here goes out until you approve it.</p>
      </div>

      {!!photosWaiting && (
        <Link href="/library" className="flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 hover:bg-amber-100">
          <span><strong>{photosWaiting}</strong> {photosWaiting === 1 ? "photo" : "photos"} from your team to look at.</span>
          <span className="font-medium">Look now</span>
        </Link>
      )}

      {(weekRows || []).length > 0 && (
        <section className="space-y-2 rounded-lg border border-emerald-200 bg-emerald-50 p-4">
          <h2 className="text-sm font-semibold text-emerald-900">Approved and ready to export</h2>
          <ul className="space-y-2">
            {(weekRows || []).map((w) => (
              <li key={w.id} className="flex flex-wrap items-center justify-between gap-3 text-sm text-emerald-900">
                <span>{dateLabel(w.date_start)} to {dateLabel(w.date_end)}: {byWeek.get(w.id)} approved {byWeek.get(w.id) === 1 ? "post" : "posts"}</span>
                <MetricoolExportButton weekId={w.id} draft={false} />
              </li>
            ))}
          </ul>
          <p className="text-xs text-emerald-800">The file has only the posts you have approved, with their days and times.</p>
        </section>
      )}

      {nothing ? (
        <div className="rounded-lg border border-dashed border-gray-300 p-10 text-center text-sm text-gray-500">
          Nothing is waiting. <Link href="/generate/quick" className="text-violet-700 underline">Write a post</Link> or check back tomorrow morning.
        </div>
      ) : (
        <ul className="space-y-4">
          {pieces.map((p) => <ApprovalCard key={p.id} piece={p} companyId={companyId} />)}
        </ul>
      )}
    </div>
  );
}
