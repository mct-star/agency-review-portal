import type { Metadata } from "next";
import Link from "next/link";
import { revalidatePath } from "next/cache";
import { createServerSupabaseClient, getUserProfile } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Notifications | AGENCY" };
export const dynamic = "force-dynamic";

/** Where a notification of each kind takes you. */
const LINKS: Record<string, string> = {
  draft_ready: "/approvals",
  staff_photo_pending: "/library",
  piece_approved: "/review",
  changes_requested: "/review",
  comment_added: "/review",
  content_ready: "/review",
};

/**
 * Mark every unread notification of the signed-in person as read. Uses the
 * person's own session, so row security limits it to their notifications as
 * well as the explicit filter.
 */
async function markAllRead() {
  "use server";
  const profile = await getUserProfile();
  if (!profile) return;
  const supabase = await createServerSupabaseClient();
  await supabase.from("notifications").update({ read: true }).eq("recipient_user_id", profile.id).eq("read", false);
  revalidatePath("/notifications");
}

function whenLabel(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}

export default async function NotificationsPage() {
  const profile = await getUserProfile();
  if (!profile) return null;
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase
    .from("notifications")
    .select("id, type, message, read, created_at")
    .eq("recipient_user_id", profile.id)
    .order("created_at", { ascending: false })
    .limit(100);
  const rows = (data || []) as Array<{ id: string; type: string; message: string; read: boolean; created_at: string }>;
  const unread = rows.filter((r) => !r.read).length;

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Notifications</h1>
          <p className="mt-1 text-sm text-gray-600">{unread === 0 ? "You are up to date." : `${unread} new.`}</p>
        </div>
        {unread > 0 && (
          <form action={markAllRead}>
            <button type="submit" className="min-h-[44px] rounded-md border border-gray-300 bg-white px-4 text-sm font-medium text-gray-700 hover:bg-gray-50">
              Mark all read
            </button>
          </form>
        )}
      </div>

      {rows.length === 0 ? (
        <p className="rounded-lg border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500">Nothing yet. We will tell you here when a post or a photo is waiting for you.</p>
      ) : (
        <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white">
          {rows.map((n) => {
            const inner = (
              <>
                <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.read ? "bg-transparent" : "bg-violet-600"}`} aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className={`block break-words text-sm ${n.read ? "text-gray-600" : "font-medium text-gray-900"}`}>{n.message}</span>
                  <span className="block text-xs text-gray-500">{whenLabel(n.created_at)}{n.read ? "" : ". New"}</span>
                </span>
              </>
            );
            const href = LINKS[n.type];
            return (
              <li key={n.id}>
                {href ? (
                  <Link href={href} className="flex min-h-[44px] items-start gap-3 px-4 py-3 hover:bg-gray-50">{inner}</Link>
                ) : (
                  <div className="flex min-h-[44px] items-start gap-3 px-4 py-3">{inner}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
