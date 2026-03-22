/**
 * Email Service — powered by Resend
 *
 * Sends transactional emails from the platform:
 * - Welcome / invitation emails for new users
 * - Magic link resends
 * - Content review notifications
 * - Week delivery confirmations
 *
 * Sender defaults to mct@agencybristol.com but can be overridden
 * per-company once additional domains are verified in Resend.
 */

import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

const DEFAULT_FROM = "AGENCY Bristol <mct@agencybristol.com>";
const FALLBACK_FROM = "AGENCY Bristol <onboarding@resend.dev>"; // Resend sandbox

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  from?: string;
  replyTo?: string;
}

export interface EmailResult {
  success: boolean;
  id?: string;
  error?: string;
}

// ─────────────────────────────────────────────
// Core send function
// ─────────────────────────────────────────────

export async function sendEmail(options: SendEmailOptions): Promise<EmailResult> {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey || apiKey === "re_placeholder") {
    console.warn("[Email] RESEND_API_KEY not configured — email not sent");
    return { success: false, error: "Resend API key not configured" };
  }

  // Use the verified domain sender, or fall back to Resend sandbox
  const from = options.from || DEFAULT_FROM;

  try {
    const { data, error } = await resend.emails.send({
      from,
      to: options.to,
      subject: options.subject,
      html: options.html,
      replyTo: options.replyTo || "mct@agencybristol.com",
    });

    if (error) {
      console.error("[Email] Resend error:", error);
      // If custom domain fails, try Resend sandbox
      if (from !== FALLBACK_FROM) {
        console.log("[Email] Retrying with Resend sandbox sender...");
        const retry = await resend.emails.send({
          from: FALLBACK_FROM,
          to: options.to,
          subject: options.subject,
          html: options.html,
          replyTo: options.replyTo || "mct@agencybristol.com",
        });
        if (retry.error) {
          return { success: false, error: retry.error.message };
        }
        return { success: true, id: retry.data?.id };
      }
      return { success: false, error: error.message };
    }

    return { success: true, id: data?.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[Email] Send failed:", message);
    return { success: false, error: message };
  }
}

// ─────────────────────────────────────────────
// Email templates
// ─────────────────────────────────────────────

export function welcomeEmailHtml(params: {
  userName: string;
  companyName: string;
  loginUrl: string;
}): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#0ea5e9,#8b5cf6);padding:32px 40px;text-align:center;">
              <h1 style="margin:0;color:#ffffff;font-size:24px;font-weight:700;letter-spacing:-0.5px;">
                AGENCY Content Platform
              </h1>
              <p style="margin:8px 0 0;color:rgba(255,255,255,0.85);font-size:13px;">
                Powered by Copy Magic
              </p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:40px;">
              <h2 style="margin:0 0 16px;color:#111827;font-size:20px;font-weight:600;">
                Welcome, ${params.userName}
              </h2>
              <p style="margin:0 0 24px;color:#4b5563;font-size:15px;line-height:1.6;">
                You have been invited to the <strong>${params.companyName}</strong> content workspace on AGENCY's Content Platform. This is where you will review, approve, and publish your weekly content.
              </p>

              <table cellpadding="0" cellspacing="0" style="margin:0 0 32px;">
                <tr>
                  <td style="background-color:#0ea5e9;border-radius:8px;padding:14px 28px;">
                    <a href="${params.loginUrl}" style="color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;display:block;">
                      Sign In to Your Workspace
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin:0 0 8px;color:#6b7280;font-size:13px;">
                You will sign in using a magic link sent to your email. No password needed.
              </p>

              <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;">

              <p style="margin:0;color:#9ca3af;font-size:12px;">
                This email was sent by AGENCY Bristol. If you did not expect this invitation, you can safely ignore it.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function magicLinkEmailHtml(params: {
  userName: string;
  loginUrl: string;
}): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
          <tr>
            <td style="background:linear-gradient(135deg,#0ea5e9,#8b5cf6);padding:24px 40px;text-align:center;">
              <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:700;">
                AGENCY Content Platform
              </h1>
            </td>
          </tr>
          <tr>
            <td style="padding:40px;">
              <h2 style="margin:0 0 16px;color:#111827;font-size:18px;">
                Sign In Request
              </h2>
              <p style="margin:0 0 24px;color:#4b5563;font-size:15px;line-height:1.6;">
                Hi ${params.userName}, click below to sign in to your content workspace.
              </p>
              <table cellpadding="0" cellspacing="0" style="margin:0 0 32px;">
                <tr>
                  <td style="background-color:#0ea5e9;border-radius:8px;padding:14px 28px;">
                    <a href="${params.loginUrl}" style="color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;display:block;">
                      Sign In
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin:0;color:#9ca3af;font-size:12px;">
                This link expires in 1 hour. If you did not request this, ignore this email.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function contentReadyEmailHtml(params: {
  userName: string;
  companyName: string;
  weekNumber: number;
  weekLabel?: string;
  reviewUrl: string;
  pieceCount: number;
}): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
          <tr>
            <td style="background:linear-gradient(135deg,#0ea5e9,#8b5cf6);padding:24px 40px;text-align:center;">
              <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:700;">
                Content Ready for Review
              </h1>
            </td>
          </tr>
          <tr>
            <td style="padding:40px;">
              <p style="margin:0 0 16px;color:#4b5563;font-size:15px;line-height:1.6;">
                Hi ${params.userName},
              </p>
              <p style="margin:0 0 24px;color:#4b5563;font-size:15px;line-height:1.6;">
                ${params.weekLabel || `Week ${params.weekNumber}`} content for <strong>${params.companyName}</strong> is ready for your review. There are <strong>${params.pieceCount} pieces</strong> awaiting approval.
              </p>
              <table cellpadding="0" cellspacing="0" style="margin:0 0 32px;">
                <tr>
                  <td style="background-color:#0ea5e9;border-radius:8px;padding:14px 28px;">
                    <a href="${params.reviewUrl}" style="color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;display:block;">
                      Review ${params.weekLabel || `Week ${params.weekNumber}`}
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ─────────────────────────────────────────────
// Trial Welcome Email
// ─────────────────────────────────────────────

export function trialWelcomeEmailHtml(params: {
  userName: string;
  companyName: string;
  dashboardUrl: string;
  trialDays: number;
}): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:40px 20px;"><tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
<tr><td style="background:linear-gradient(135deg,#7c3aed,#6d28d9);padding:32px 40px;text-align:center;">
<h1 style="margin:0;color:#ffffff;font-size:24px;font-weight:700;">AGENCY</h1>
<p style="margin:8px 0 0;color:rgba(255,255,255,0.85);font-size:13px;">Your ${params.trialDays}-day Pro trial has started</p>
</td></tr>
<tr><td style="padding:40px;">
<h2 style="margin:0 0 16px;color:#111827;font-size:20px;font-weight:600;">Welcome, ${params.userName}</h2>
<p style="margin:0 0 20px;color:#4b5563;font-size:15px;line-height:1.6;">Your workspace for <strong>${params.companyName}</strong> is ready. You have ${params.trialDays} days of full Pro access. Here's how to make the most of it:</p>
<table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
<tr><td style="padding:16px;background:#f9fafb;border-radius:8px;border-left:4px solid #7c3aed;">
<p style="margin:0 0 4px;color:#7c3aed;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1px;">Step 1</p>
<p style="margin:0;color:#111827;font-size:14px;font-weight:600;">Generate your first post</p>
<p style="margin:4px 0 0;color:#6b7280;font-size:13px;">Go to Quick Generate, pick a topic, and see AI write in your voice.</p>
</td></tr><tr><td style="height:8px;"></td></tr>
<tr><td style="padding:16px;background:#f9fafb;border-radius:8px;border-left:4px solid #0ea5e9;">
<p style="margin:0 0 4px;color:#0ea5e9;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1px;">Step 2</p>
<p style="margin:0;color:#111827;font-size:14px;font-weight:600;">Run a compliance review</p>
<p style="margin:4px 0 0;color:#6b7280;font-size:13px;">See the three-colour regulatory review flag issues before they become problems.</p>
</td></tr><tr><td style="height:8px;"></td></tr>
<tr><td style="padding:16px;background:#f9fafb;border-radius:8px;border-left:4px solid #d97706;">
<p style="margin:0 0 4px;color:#d97706;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1px;">Step 3</p>
<p style="margin:0;color:#111827;font-size:14px;font-weight:600;">Publish to LinkedIn</p>
<p style="margin:4px 0 0;color:#6b7280;font-size:13px;">Connect your LinkedIn account and post with one click, including images and first comments.</p>
</td></tr></table>
<table cellpadding="0" cellspacing="0" style="margin:0 0 24px;"><tr>
<td style="background-color:#7c3aed;border-radius:8px;padding:14px 28px;">
<a href="${params.dashboardUrl}" style="color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;">Go to your dashboard</a>
</td></tr></table>
<hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;">
<p style="margin:0;color:#9ca3af;font-size:12px;">Your trial includes full access to the Copy Engine and Regulatory Review modules. No credit card required.</p>
</td></tr></table></td></tr></table></body></html>`;
}

// ─────────────────────────────────────────────
// Trial Expiry Warning Email (2 days before)
// ─────────────────────────────────────────────

export function trialExpiryWarningEmailHtml(params: {
  userName: string;
  companyName: string;
  daysLeft: number;
  upgradeUrl: string;
  dashboardUrl: string;
  postsGenerated: number;
  reviewsRun: number;
}): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:40px 20px;"><tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
<tr><td style="background:linear-gradient(135deg,#d97706,#b45309);padding:32px 40px;text-align:center;">
<h1 style="margin:0;color:#ffffff;font-size:24px;font-weight:700;">AGENCY</h1>
<p style="margin:8px 0 0;color:rgba(255,255,255,0.85);font-size:13px;">Your Pro trial ends in ${params.daysLeft} day${params.daysLeft !== 1 ? "s" : ""}</p>
</td></tr>
<tr><td style="padding:40px;">
<h2 style="margin:0 0 16px;color:#111827;font-size:20px;font-weight:600;">${params.userName}, your trial is almost over</h2>
<p style="margin:0 0 20px;color:#4b5563;font-size:15px;line-height:1.6;">In the last few days, here's what AGENCY has done for <strong>${params.companyName}</strong>:</p>
<table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;"><tr>
<td width="48%" style="padding:16px;background:#f0fdf4;border-radius:8px;text-align:center;">
<p style="margin:0;color:#166534;font-size:28px;font-weight:700;">${params.postsGenerated}</p>
<p style="margin:4px 0 0;color:#16a34a;font-size:12px;font-weight:600;text-transform:uppercase;">Posts Generated</p>
</td><td width="4%"></td>
<td width="48%" style="padding:16px;background:#eff6ff;border-radius:8px;text-align:center;">
<p style="margin:0;color:#1e40af;font-size:28px;font-weight:700;">${params.reviewsRun}</p>
<p style="margin:4px 0 0;color:#3b82f6;font-size:12px;font-weight:600;text-transform:uppercase;">Compliance Reviews</p>
</td></tr></table>
<p style="margin:0 0 24px;color:#4b5563;font-size:15px;line-height:1.6;">When your trial ends, you'll move to the Starter plan (free, limited to 5 posts/month). Upgrade to Pro to keep unlimited generation, compliance review, and all the features you've been using.</p>
<table cellpadding="0" cellspacing="0" style="margin:0 0 16px;"><tr>
<td style="background-color:#7c3aed;border-radius:8px;padding:14px 28px;">
<a href="${params.upgradeUrl}" style="color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;">Upgrade to Pro ($99/month)</a>
</td></tr></table>
<p style="margin:0 0 8px;"><a href="${params.dashboardUrl}" style="color:#7c3aed;text-decoration:none;font-size:13px;">Or continue to your dashboard</a></p>
<hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;">
<p style="margin:0;color:#9ca3af;font-size:12px;">Questions? Reply to this email and Michael will get back to you personally.</p>
</td></tr></table></td></tr></table></body></html>`;
}

// ─────────────────────────────────────────────
// Trial Expired Email
// ─────────────────────────────────────────────

export function trialExpiredEmailHtml(params: {
  userName: string;
  companyName: string;
  upgradeUrl: string;
  postsGenerated: number;
}): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:40px 20px;"><tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
<tr><td style="background:#1f2937;padding:32px 40px;text-align:center;">
<h1 style="margin:0;color:#ffffff;font-size:24px;font-weight:700;">AGENCY</h1>
<p style="margin:8px 0 0;color:rgba(255,255,255,0.6);font-size:13px;">Your Pro trial has ended</p>
</td></tr>
<tr><td style="padding:40px;">
<h2 style="margin:0 0 16px;color:#111827;font-size:20px;font-weight:600;">${params.userName}, your trial is over</h2>
<p style="margin:0 0 20px;color:#4b5563;font-size:15px;line-height:1.6;">During your trial, you generated <strong>${params.postsGenerated} posts</strong> for ${params.companyName}. Your workspace is still active on the Starter plan (5 posts/month), but Pro features like unlimited generation and compliance review are now locked.</p>
<table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;"><tr>
<td style="background:#faf5ff;border-radius:8px;border:1px solid #e9d5ff;padding:20px;">
<p style="margin:0 0 8px;color:#7c3aed;font-size:14px;font-weight:700;">What you lose on Starter:</p>
<p style="margin:0 0 4px;color:#6b7280;font-size:13px;">&#10060; Unlimited content generation</p>
<p style="margin:0 0 4px;color:#6b7280;font-size:13px;">&#10060; Regulatory compliance review</p>
<p style="margin:0 0 4px;color:#6b7280;font-size:13px;">&#10060; Voice profile quality gates</p>
<p style="margin:0;color:#6b7280;font-size:13px;">&#10060; Content calendar and ecosystem linking</p>
</td></tr></table>
<table cellpadding="0" cellspacing="0" style="margin:0 0 16px;"><tr>
<td style="background-color:#7c3aed;border-radius:8px;padding:14px 28px;">
<a href="${params.upgradeUrl}" style="color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;">Upgrade to Pro ($99/month)</a>
</td></tr></table>
<hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;">
<p style="margin:0;color:#9ca3af;font-size:12px;">Not ready to upgrade? No worries. Your content and settings are saved. You can upgrade any time and pick up where you left off. Reply to this email if you have questions.</p>
</td></tr></table></td></tr></table></body></html>`;
}
