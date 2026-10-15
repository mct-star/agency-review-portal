import type { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/resend";
import { escapeHtml } from "@/lib/email/invite-email";

type SupabaseAdmin = Awaited<ReturnType<typeof createAdminSupabaseClient>>;

/**
 * Tell a company's people a draft is waiting: an in-app notification for each
 * person and one email each. The email carries the post itself and a link to
 * the page where it takes one tap to approve.
 */
export async function notifyDraftReady(
  supabase: SupabaseAdmin,
  args: { companyId: string; pieceId: string; headline: string; preview: string }
): Promise<{ notified: number; emailed: number }> {
  const { data: people } = await supabase.from("users").select("id, email, full_name").eq("company_id", args.companyId).eq("role", "client");
  const { data: company } = await supabase.from("companies").select("name").eq("id", args.companyId).maybeSingle();
  if (!people || people.length === 0) return { notified: 0, emailed: 0 };

  const base = (process.env.NEXT_PUBLIC_APP_URL || "https://agency-review-portal.vercel.app").replace(/\/+$/, "");
  const link = `${base}/approvals`;
  let emailed = 0;
  for (const p of people) {
    await supabase.from("notifications").insert({
      recipient_user_id: p.id,
      type: "draft_ready",
      content_piece_id: args.pieceId,
      message: args.headline,
    });
    const sent = await sendEmail({
      to: p.email,
      subject: args.headline,
      html: `<p>Hello ${escapeHtml(p.full_name || "there")},</p><p>${escapeHtml(args.headline)}</p><blockquote style="border-left:3px solid #ddd;margin:12px 0;padding:4px 12px;color:#374151;white-space:pre-line">${escapeHtml(args.preview)}</blockquote><p><a href="${escapeHtml(link)}">Open it and approve</a>. It takes one tap. Nothing goes out until you do.</p><p style="color:#6b7280;font-size:12px">${escapeHtml(company?.name || "")}</p>`,
    });
    if (sent.success) emailed += 1;
  }
  return { notified: people.length, emailed };
}

/**
 * The weather post (or another automatic draft) did not draft. The venue's
 * people get an in-app notice that says so plainly; AGENCY's admins get the
 * reason by email so someone can look. Nothing here names a vendor to the
 * venue.
 */
export async function notifyDraftFailed(
  supabase: SupabaseAdmin,
  args: { companyId: string; companyName: string; what: string; date: string; reason: string }
): Promise<{ notified: number; emailed: number }> {
  const { data: people } = await supabase.from("users").select("id").eq("company_id", args.companyId).eq("role", "client");
  for (const p of people || []) {
    await supabase.from("notifications").insert({
      recipient_user_id: p.id,
      type: "draft_failed",
      message: `${args.what} for ${args.date} did not draft. You can write one yourself from Write a post.`,
    });
  }
  const { data: admins } = await supabase.from("users").select("email").eq("role", "admin");
  let emailed = 0;
  for (const a of admins || []) {
    if (!a.email) continue;
    const sent = await sendEmail({
      to: a.email,
      subject: `${args.companyName}: ${args.what} did not draft (${args.date})`,
      html: `<p>${escapeHtml(args.what)} for ${escapeHtml(args.companyName)} on ${escapeHtml(args.date)} failed.</p><pre style="white-space:pre-wrap;color:#374151">${escapeHtml(args.reason)}</pre><p>The job retries once an hour later. If it fails again the venue has been told to write the post themselves.</p>`,
    });
    if (sent.success) emailed += 1;
  }
  return { notified: (people || []).length, emailed };
}
