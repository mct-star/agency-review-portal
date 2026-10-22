import type { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/resend";
import { escapeHtml } from "@/lib/email/invite-email";

type SupabaseAdmin = Awaited<ReturnType<typeof createAdminSupabaseClient>>;

const EMAIL_GAP_MS = 30 * 60 * 1000;

/**
 * Tell a company's people that photos are waiting. One in-app notification
 * while any unread one is open, and at most one email every 30 minutes, so a
 * morning of uploads does not become forty emails.
 */
export async function notifyStaffPhotosPending(supabase: SupabaseAdmin, companyId: string): Promise<void> {
  const { data: company } = await supabase
    .from("companies")
    .select("name, staff_upload_notified_at")
    .eq("id", companyId)
    .maybeSingle();
  if (!company) return;

  const { data: people } = await supabase.from("users").select("id, email, full_name").eq("company_id", companyId).eq("role", "client");
  if (!people || people.length === 0) return;

  const { count } = await supabase
    .from("photo_inventory")
    .select("id", { count: "exact", head: true })
    .eq("company_id", companyId)
    .eq("status", "pending");
  const waiting = count ?? 0;
  const message = `${waiting} ${waiting === 1 ? "photo" : "photos"} from your team ${waiting === 1 ? "is" : "are"} waiting for you to approve.`;

  for (const p of people) {
    const { data: open } = await supabase
      .from("notifications")
      .select("id")
      .eq("recipient_user_id", p.id)
      .eq("type", "staff_photo_pending")
      .eq("read", false)
      .maybeSingle();
    if (open) await supabase.from("notifications").update({ message }).eq("id", open.id);
    else await supabase.from("notifications").insert({ recipient_user_id: p.id, type: "staff_photo_pending", message });
  }

  const last = company.staff_upload_notified_at ? new Date(company.staff_upload_notified_at).getTime() : 0;
  if (Date.now() - last < EMAIL_GAP_MS) return;
  await supabase.from("companies").update({ staff_upload_notified_at: new Date().toISOString() }).eq("id", companyId);

  const base = (process.env.NEXT_PUBLIC_APP_URL || "https://agency-review-portal.vercel.app").replace(/\/+$/, "");
  const link = `${base}/library`;
  for (const p of people) {
    await sendEmail({
      to: p.email,
      subject: `Photos from your team are waiting`,
      html: `<p>Hello ${escapeHtml(p.full_name || "there")},</p><p>${escapeHtml(message)}</p><p><a href="${escapeHtml(link)}">Open the library and approve them</a>. It takes one tap each.</p><p style="color:#6b7280;font-size:12px">${escapeHtml(company.name)}</p>`,
    });
  }
}
