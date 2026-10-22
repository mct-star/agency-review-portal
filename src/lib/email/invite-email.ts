/**
 * The email a person receives when they are invited into a company.
 * Plain wording, no supplier names, no dashes used as punctuation.
 */

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function inviteEmail(params: {
  userName: string;
  companyName: string;
  signInUrl: string;
  loginUrl: string;
  invitedBy?: string | null;
}): { subject: string; html: string; text: string } {
  const name = escapeHtml(params.userName);
  const company = escapeHtml(params.companyName);
  const by = params.invitedBy ? ` ${escapeHtml(params.invitedBy)} has` : " You have";
  const subject = `Your ${params.companyName} content platform sign in`;

  const text = [
    `Hello ${params.userName},`,
    "",
    `${params.invitedBy ? `${params.invitedBy} has` : "You have"} set you up on the ${params.companyName} content platform.`,
    "",
    `Sign in here: ${params.signInUrl}`,
    "",
    `The link works once. After that, sign in at ${params.loginUrl} and choose "Use magic link instead" to get a fresh one by email.`,
    "",
    "If you were not expecting this, you can ignore this email.",
  ].join("\n");

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:40px 20px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:12px;overflow:hidden;">
        <tr><td style="padding:40px;">
          <h2 style="margin:0 0 16px;color:#111827;font-size:20px;font-weight:600;">Hello ${name}</h2>
          <p style="margin:0 0 24px;color:#4b5563;font-size:15px;line-height:1.6;">${by} set you up on the <strong>${company}</strong> content platform. This is where you add photos, approve posts and plan the week.</p>
          <table cellpadding="0" cellspacing="0" style="margin:0 0 24px;"><tr>
            <td style="background-color:#7c3aed;border-radius:8px;padding:14px 28px;">
              <a href="${escapeHtml(params.signInUrl)}" style="color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;display:block;">Sign in</a>
            </td>
          </tr></table>
          <p style="margin:0 0 8px;color:#6b7280;font-size:13px;line-height:1.5;">The button works once. After that, go to <a href="${escapeHtml(params.loginUrl)}" style="color:#7c3aed;">${escapeHtml(params.loginUrl)}</a> and choose &quot;Use magic link instead&quot; to get a fresh one by email.</p>
          <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;">
          <p style="margin:0;color:#9ca3af;font-size:12px;">If you were not expecting this, you can ignore this email.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  return { subject, html, text };
}
