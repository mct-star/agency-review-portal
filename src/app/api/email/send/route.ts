import { NextResponse } from "next/server";
import { requireAdmin, createAdminSupabaseClient } from "@/lib/supabase/admin";
import { formatWeekLabel } from "@/lib/utils/format-week-label";
import {
  sendEmail,
  welcomeEmailHtml,
  magicLinkEmailHtml,
  contentReadyEmailHtml,
} from "@/lib/email/resend";

/**
 * POST /api/email/send
 *
 * Sends transactional emails. Types:
 * - "welcome" — invitation email for new user
 * - "magic_link" — resend sign-in link
 * - "content_ready" — notify client of new content
 * - "test" — send a test email to verify setup
 *
 * Body: { type, to, userName?, companyName?, weekNumber?, weekId?, pieceCount? }
 */
export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { type, to } = body;

  if (!type || !to) {
    return NextResponse.json({ error: "type and to are required" }, { status: 400 });
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://agency-review-portal.vercel.app";

  switch (type) {
    case "welcome": {
      const { userName = "there", companyName = "your company" } = body;
      const result = await sendEmail({
        to,
        subject: `Welcome to AGENCY Content Platform — ${companyName}`,
        html: welcomeEmailHtml({
          userName,
          companyName,
          loginUrl: `${baseUrl}/login`,
        }),
      });
      return NextResponse.json(result);
    }

    case "magic_link": {
      // Use Supabase to generate and send a magic link
      const supabase = await createAdminSupabaseClient();
      const { error } = await supabase.auth.admin.generateLink({
        type: "magiclink",
        email: to,
        options: {
          redirectTo: `${baseUrl}/auth/callback`,
        },
      });

      if (error) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
      }

      // Also send our branded email
      const { userName = "there" } = body;
      const result = await sendEmail({
        to,
        subject: "Sign in to AGENCY Content Platform",
        html: magicLinkEmailHtml({
          userName,
          loginUrl: `${baseUrl}/login`,
        }),
      });
      return NextResponse.json(result);
    }

    case "content_ready": {
      const { userName = "there", companyName = "", weekNumber = 0, weekId = "", pieceCount = 0, dateStart = "" } = body;
      const weekLabel = formatWeekLabel(dateStart || null, weekNumber);
      const result = await sendEmail({
        to,
        subject: `${weekLabel} content ready for review — ${companyName}`,
        html: contentReadyEmailHtml({
          userName,
          companyName,
          weekNumber,
          weekLabel,
          reviewUrl: `${baseUrl}/review/${weekId}`,
          pieceCount,
        }),
      });
      return NextResponse.json(result);
    }

    case "test": {
      const result = await sendEmail({
        to,
        subject: "AGENCY Content Platform — Test Email",
        html: welcomeEmailHtml({
          userName: "Test User",
          companyName: "AGENCY Bristol",
          loginUrl: `${baseUrl}/login`,
        }),
      });
      return NextResponse.json(result);
    }

    default:
      return NextResponse.json({ error: `Unknown email type: ${type}` }, { status: 400 });
  }
}
